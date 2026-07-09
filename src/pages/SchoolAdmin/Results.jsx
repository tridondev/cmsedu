import { useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, setDoc, writeBatch } from "firebase/firestore";
import { db } from "../../firebase/config";
import {
  computeClassPositions,
  computeCumulativeTerm,
  computeSubjectClassAverages,
  gradingScaleFor,
  effectiveWeights,
  gradeFor,
} from "../../lib/resultEngine";
import { exportClassResults, downloadWorkbook } from "../../lib/exportToExcel";
import StudentReportModal from "../../components/StudentReportModal";

const TERMS = ["First", "Second", "Third"];

/**
 * Result docs are scoped per academic session so that starting a new
 * session (see Settings.jsx) never overwrites a prior session's scores —
 * without the session in the key, the same "{term}_{classId}" doc id would
 * repeat, and get reused, every year.
 */
function resultKeyFor(session, term, classId) {
  const s = (session || "session").replace(/[^a-zA-Z0-9]+/g, "-");
  return `${s}_${term}_${classId}`;
}

async function fetchTermScores(schoolId, session, classId, term) {
  const resultKey = resultKeyFor(session, term, classId);
  const snap = await getDocs(collection(db, "schools", schoolId, "results", resultKey, "scores"));
  const byStudent = {};
  snap.forEach((d) => {
    const [studentId, subjectId] = d.id.split("_");
    byStudent[studentId] = byStudent[studentId] || {};
    byStudent[studentId][subjectId] = d.data();
  });
  return byStudent;
}

export default function Results({ schoolId }) {
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState("");
  const [term, setTerm] = useState("First");
  const [school, setSchool] = useState(null);
  const [students, setStudents] = useState([]);
  const [scoresByStudent, setScoresByStudent] = useState({});
  const [positions, setPositions] = useState({});
  const [reportMeta, setReportMeta] = useState({}); // { [studentId]: { behaviour, formMasterRemark, principalRemark, signatureDate, promotionComment } }
  const [termDates, setTermDates] = useState({ termEndingDate: "", nextTermBegins: "" });
  const [reportStudentId, setReportStudentId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState(null);

  useEffect(() => {
    getDoc(doc(db, "schools", schoolId)).then((snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setSchool(data);
        if (data.currentTerm) setTerm(data.currentTerm);
      }
    });
  }, [schoolId]);

  useEffect(() => {
    const q = query(collection(db, "schools", schoolId, "classes"), orderBy("name"));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setClasses(list);
      if (!classId && list.length) setClassId(list[0].id);
    });
  }, [schoolId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!classId) return;
    const q = query(collection(db, "schools", schoolId, "classes", classId, "students"), orderBy("fullName"));
    return onSnapshot(q, (snap) => setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
  }, [schoolId, classId]);

  useEffect(() => {
    if (!classId || !term || !school) return;
    const resultKey = resultKeyFor(school.currentSession, term, classId);
    (async () => {
      setScoresByStudent(await fetchTermScores(schoolId, school.currentSession, classId, term));
      const metaSnap = await getDoc(doc(db, "schools", schoolId, "results", resultKey, "meta", "positions"));
      setPositions(metaSnap.exists() ? metaSnap.data().positions || {} : {});

      const resultDocSnap = await getDoc(doc(db, "schools", schoolId, "results", resultKey));
      const resultData = resultDocSnap.exists() ? resultDocSnap.data() : {};
      setTermDates({
        termEndingDate: resultData.termEndingDate || "",
        nextTermBegins: resultData.nextTermBegins || "",
      });

      const reportSnap = await getDocs(collection(db, "schools", schoolId, "results", resultKey, "reportMeta"));
      const meta = {};
      reportSnap.forEach((d) => (meta[d.id] = d.data()));
      setReportMeta(meta);
    })();
  }, [schoolId, classId, term, school]);

  const selectedClass = classes.find((c) => c.id === classId);
  const subjects = selectedClass?.subjects || [];

  const recompute = async () => {
    setBusy(true);
    setError(null);
    try {
      const totals = {};
      Object.entries(scoresByStudent).forEach(([studentId, subs]) => {
        totals[studentId] = {};
        Object.entries(subs).forEach(([subjectId, s]) => {
          totals[studentId][subjectId] = s.total || 0;
        });
      });
      const computed = computeClassPositions(totals, subjects.map((s) => s.id));
      await setDoc(
        doc(db, "schools", schoolId, "results", resultKeyFor(school?.currentSession, term, classId), "meta", "positions"),
        { positions: computed, computedAt: Date.now() },
        { merge: true }
      );
      setPositions(computed);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const saveTermDates = async (patch) => {
    const next = { ...termDates, ...patch };
    setTermDates(next);
    await setDoc(doc(db, "schools", schoolId, "results", resultKeyFor(school?.currentSession, term, classId)), next, { merge: true });
  };

  const saveReportMeta = async (studentId, data) => {
    await setDoc(
      doc(db, "schools", schoolId, "results", resultKeyFor(school?.currentSession, term, classId), "reportMeta", studentId),
      data,
      { merge: true }
    );
    setReportMeta((prev) => ({ ...prev, [studentId]: { ...prev[studentId], ...data } }));
  };

  const classAverages = (() => {
    const totals = {};
    Object.entries(scoresByStudent).forEach(([studentId, subs]) => {
      totals[studentId] = {};
      Object.entries(subs).forEach(([subjectId, s]) => {
        totals[studentId][subjectId] = s.total ?? 0;
      });
    });
    return computeSubjectClassAverages(totals, subjects.map((s) => s.id));
  })();

  const buildStudentExportData = (studentId) => {
    const s = students.find((st) => st.id === studentId);
    const pos = positions[studentId] || {};
    const meta = reportMeta[studentId] || {};
    const scores = {};
    subjects.forEach((subj) => {
      const raw = scoresByStudent[studentId]?.[subj.id] || {};
      scores[subj.id] = {
        ...raw,
        classAvg: classAverages[subj.id] ?? "",
        position: pos.subjectPositions?.[subj.id] || "",
      };
    });
    return {
      id: studentId,
      fullName: s?.fullName || "",
      examNo: s?.examNo || "",
      sex: s?.sex || "",
      stateOfOrigin: s?.stateOfOrigin || "",
      lga: s?.lga || "",
      scores,
      overallPosition: pos.overallPosition || "",
      overallAverage: pos.overallAverage || "",
      behaviour: meta.behaviour || {},
      formMasterRemark: meta.formMasterRemark || "",
      principalRemark: meta.principalRemark || "",
      signatureDate: meta.signatureDate || "",
      promotionComment: meta.promotionComment || "",
    };
  };

  /**
   * TEMPORARY one-time migration: older score docs (saved before `remark`
   * was added alongside `grade` in ScoreEntryGrid's saveRow) are missing
   * the `remark` field, so the Remarks column on exported reports is blank
   * for them even though Grade shows fine. This walks every class/term for
   * the school's current session, finds score docs that have a `total` but
   * no `remark`, and patches just that field in using the same gradeFor()
   * logic saveRow already uses — nothing else about the doc is touched.
   * Safe to run more than once: docs that already have a remark are skipped.
   * Remove this button + function once you've run it across all your
   * classes/terms and confirmed the Remarks column is populated.
   */
  const backfillMissingRemarks = async () => {
    if (!school || classes.length === 0) return;
    setBackfilling(true);
    setBackfillResult(null);
    let checked = 0;
    let patched = 0;
    try {
      for (const c of classes) {
        const scale = gradingScaleFor(c.level);
        for (const t of TERMS) {
          const resultKey = resultKeyFor(school.currentSession, t, c.id);
          const snap = await getDocs(collection(db, "schools", schoolId, "results", resultKey, "scores"));
          if (snap.empty) continue;

          let batch = writeBatch(db);
          let opsInBatch = 0;
          for (const d of snap.docs) {
            checked++;
            const data = d.data();
            if (data.remark || data.total == null) continue; // already fixed, or nothing to grade yet
            const { grade, remark } = gradeFor(data.total, scale);
            batch.set(d.ref, { grade, remark }, { merge: true });
            patched++;
            opsInBatch++;
            if (opsInBatch === 400) {
              await batch.commit();
              batch = writeBatch(db);
              opsInBatch = 0;
            }
          }
          if (opsInBatch > 0) await batch.commit();
        }
      }
      setBackfillResult({ checked, patched });
    } catch (err) {
      setBackfillResult({ error: err.message });
    } finally {
      setBackfilling(false);
    }
  };

  const doExport = async () => {
    setBusy(true);
    setError(null);
    try {
      const isThirdTerm = term === "Third";
      const classInfo = {
        className: selectedClass.name,
        level: selectedClass.level,
        stream: selectedClass.stream,
        session: school?.currentSession || "",
        term: `${term} Term`,
        noInClass: students.length,
        termEndingDate: termDates.termEndingDate,
        nextTermBegins: termDates.nextTermBegins,
        subjects,
        weights: effectiveWeights(gradingScaleFor(selectedClass.level), school?.weights),
      };

      let cumulative;
      let exportStudents = students.map((s) => buildStudentExportData(s.id));

      if (isThirdTerm) {
        const firstScores = await fetchTermScores(schoolId, school?.currentSession, classId, "First");
        const secondScores = await fetchTermScores(schoolId, school?.currentSession, classId, "Second");
        cumulative = {};
        students.forEach((s) => {
          cumulative[s.id] = {};
          subjects.forEach((subj) => {
            cumulative[s.id][subj.id] = {
              term1: firstScores[s.id]?.[subj.id]?.total ?? "",
              term2: secondScores[s.id]?.[subj.id]?.total ?? "",
            };
          });
        });
        // Recompute cumulative position across all three terms for the export.
        const termTotals = { First: {}, Second: {}, Third: {} };
        students.forEach((s) => {
          termTotals.First[s.id] = {};
          termTotals.Second[s.id] = {};
          termTotals.Third[s.id] = {};
          subjects.forEach((subj) => {
            termTotals.First[s.id][subj.id] = firstScores[s.id]?.[subj.id]?.total || 0;
            termTotals.Second[s.id][subj.id] = secondScores[s.id]?.[subj.id]?.total || 0;
            termTotals.Third[s.id][subj.id] = scoresByStudent[s.id]?.[subj.id]?.total || 0;
          });
        });
        const cumulativePositions = computeCumulativeTerm(termTotals, subjects.map((s) => s.id));
        exportStudents = exportStudents.map((s) => ({
          ...s,
          cumulativePosition: cumulativePositions[s.id]?.overallPosition || "",
        }));
      }

      const buffer = await exportClassResults(
        {
          name: school?.name,
          address: school?.address,
          ministry: school?.ministry,
          logoUrl: school?.logoUrl,
          govLogoUrl: school?.govLogoUrl,
          formMasterSigUrl: school?.formMasterSigUrl,
          principalSigUrl: school?.principalSigUrl,
        },
        classInfo,
        exportStudents,
        { isThirdTerm, cumulative }
      );
      downloadWorkbook(buffer, `${selectedClass.name}_${term}_Term_Results.xlsx`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="page-title">Results & Export</h2>
        <p className="page-subtitle">
          Each student's full report card exports to its own print-ready A4 page in the workbook.
        </p>
      </div>

      <div className="card-pad flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex-1">
          <label className="field-label">Class</label>
          <select className="input" value={classId} onChange={(e) => setClassId(e.target.value)}>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="field-label">Term</label>
          <select className="input" value={term} onChange={(e) => setTerm(e.target.value)}>
            {TERMS.map((t) => (
              <option key={t} value={t}>
                {t} Term
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="field-label">Term ending</label>
          <input
            className="input"
            placeholder="e.g. 12th December, 2025"
            value={termDates.termEndingDate}
            onChange={(e) => setTermDates((prev) => ({ ...prev, termEndingDate: e.target.value }))}
            onBlur={(e) => saveTermDates({ termEndingDate: e.target.value })}
          />
        </div>
        <div className="flex-1">
          <label className="field-label">Next term begins</label>
          <input
            className="input"
            placeholder="e.g. 5th January, 2026"
            value={termDates.nextTermBegins}
            onChange={(e) => setTermDates((prev) => ({ ...prev, nextTermBegins: e.target.value }))}
            onBlur={(e) => saveTermDates({ nextTermBegins: e.target.value })}
          />
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" disabled={busy || !classId} onClick={recompute}>
            Recompute positions
          </button>
          <button className="btn-primary" disabled={busy || !classId || students.length === 0} onClick={doExport}>
            {busy ? "Working…" : "Export to Excel"}
          </button>
        </div>
      </div>

      {/* TEMPORARY: one-time migration for score docs saved before `remark`
          existed. Remove this block once you've run it and confirmed every
          class/term's Remarks column exports correctly. */}
      <div className="card-pad bg-amber-50 border border-amber-100 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-900">Fix missing subject remarks (one-time)</p>
          <p className="text-xs text-amber-700">
            Scans every class/term for this session and fills in the Remarks column for any older score
            entries that are missing it. Safe to run more than once.
          </p>
          {backfillResult && !backfillResult.error && (
            <p className="text-xs text-emerald-700 mt-1">
              Checked {backfillResult.checked} score entries, patched {backfillResult.patched} missing remarks.
            </p>
          )}
          {backfillResult?.error && (
            <p className="text-xs text-red-600 mt-1">Backfill failed: {backfillResult.error}</p>
          )}
        </div>
        <button className="btn-secondary" disabled={backfilling} onClick={backfillMissingRemarks}>
          {backfilling ? "Fixing…" : "Fix missing remarks"}
        </button>
      </div>

      {error && <p className="text-red-600 text-sm bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
      {!classId && <p className="text-slate-400 text-sm">Create a class first.</p>}

      {classId && (
        <>
          {/* Desktop / tablet table */}
          <div className="hidden sm:block table-wrap">
            <table className="table-modern">
              <thead>
                <tr>
                  <th>Student</th>
                  {subjects.map((s) => (
                    <th key={s.id} className="text-center">
                      {s.name}
                    </th>
                  ))}
                  <th className="text-center">Total</th>
                  <th className="text-center">Average</th>
                  <th className="text-center">Position</th>
                  <th className="text-center">Report</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => {
                  const pos = positions[s.id] || {};
                  return (
                    <tr key={s.id}>
                      <td className="font-medium text-slate-800">{s.fullName}</td>
                      {subjects.map((subj) => (
                        <td key={subj.id} className="text-center">
                          {scoresByStudent[s.id]?.[subj.id]?.total ?? "-"}
                        </td>
                      ))}
                      <td className="text-center font-semibold text-slate-900">{pos.overallTotal ?? "-"}</td>
                      <td className="text-center">{pos.overallAverage ?? "-"}</td>
                      <td className="text-center">
                        <span className="badge-brand">{pos.overallPosition ?? "-"}</span>
                      </td>
                      <td className="text-center">
                        <button className="btn-secondary btn-sm" onClick={() => setReportStudentId(s.id)}>
                          Ratings &amp; remarks
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {students.length === 0 && (
                  <tr>
                    <td className="p-6 text-center text-slate-400" colSpan={subjects.length + 5}>
                      No students in this class.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden flex flex-col gap-3">
            {students.map((s) => {
              const pos = positions[s.id] || {};
              return (
                <div key={s.id} className="row-card">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-slate-900 text-sm">{s.fullName}</p>
                    <span className="badge-brand">Pos. {pos.overallPosition ?? "-"}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 text-xs text-slate-500">
                    {subjects.map((subj) => (
                      <div key={subj.id} className="flex justify-between">
                        <span>{subj.name}</span>
                        <span className="font-medium text-slate-700">{scoresByStudent[s.id]?.[subj.id]?.total ?? "-"}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between mt-2 pt-2 border-t border-slate-100 text-xs">
                    <span className="text-slate-500">Total: <b className="text-slate-800">{pos.overallTotal ?? "-"}</b></span>
                    <span className="text-slate-500">Average: <b className="text-slate-800">{pos.overallAverage ?? "-"}</b></span>
                  </div>
                  <button className="btn-secondary btn-sm w-full mt-2" onClick={() => setReportStudentId(s.id)}>
                    Ratings &amp; remarks
                  </button>
                </div>
              );
            })}
            {students.length === 0 && <div className="card-pad text-center text-slate-400 text-sm">No students in this class.</div>}
          </div>
        </>
      )}

      {reportStudentId && (
        <StudentReportModal
          student={students.find((s) => s.id === reportStudentId)}
          average={positions[reportStudentId]?.overallAverage}
          isThirdTerm={term === "Third"}
          initial={reportMeta[reportStudentId]}
          onClose={() => setReportStudentId(null)}
          onSave={(data) => saveReportMeta(reportStudentId, data)}
        />
      )}
    </div>
  );
}