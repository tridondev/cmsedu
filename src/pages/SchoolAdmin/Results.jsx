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
  rankWithTies,
} from "../../lib/resultEngine";
import { exportClassResults, exportCombinedResults, downloadWorkbook } from "../../lib/exportToExcel";
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
  const [scope, setScope] = useState("class"); // "class" | "level"
  const [level, setLevel] = useState("");
  const [term, setTerm] = useState("First");
  const [school, setSchool] = useState(null);
  const [students, setStudents] = useState([]);
  const [scoresByStudent, setScoresByStudent] = useState({});
  const [positions, setPositions] = useState({});
  const [reportMeta, setReportMeta] = useState({}); // { [studentId]: { behaviour, formMasterRemark, principalRemark, signatureDate, promotionComment } }
  const [termDates, setTermDates] = useState({ termEndingDate: "", nextTermBegins: "" });
  const [lockedSubjects, setLockedSubjects] = useState([]); // subjectIds locked for this class+term+session
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
      if (!level && list.length) setLevel(list[0].level);
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
      setLockedSubjects(resultData.lockedSubjects || []);

      const reportSnap = await getDocs(collection(db, "schools", schoolId, "results", resultKey, "reportMeta"));
      const meta = {};
      reportSnap.forEach((d) => (meta[d.id] = d.data()));
      setReportMeta(meta);
    })();
  }, [schoolId, classId, term, school]);

  const selectedClass = classes.find((c) => c.id === classId);
  const subjects = selectedClass?.subjects || [];
  const levels = [...new Set(classes.map((c) => c.level))].sort();
  const levelClasses = classes.filter((c) => c.level === level);

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

  /**
   * Locks/unlocks a subject for the currently selected class+term+session.
   * Locking does NOT remove the teacher's assignment (Teachers.jsx) — they
   * stay assigned so they're ready for the next term — it only blocks
   * further edits to scores already entered for THIS term. Enforcement of
   * the block must also live in Firestore security rules (see note in
   * Teachers.jsx / firestore.rules), since this flag alone only drives the
   * UI here; a teacher writing directly to Firestore must be blocked
   * server-side too.
   */
  const toggleSubjectLock = async (subjectId) => {
    const next = lockedSubjects.includes(subjectId)
      ? lockedSubjects.filter((id) => id !== subjectId)
      : [...lockedSubjects, subjectId];
    setLockedSubjects(next);
    try {
      await setDoc(
        doc(db, "schools", schoolId, "results", resultKeyFor(school?.currentSession, term, classId)),
        { lockedSubjects: next },
        { merge: true }
      );
    } catch (err) {
      setLockedSubjects(lockedSubjects); // revert on failure
      setError(err.message);
    }
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

  /**
   * Whole-level export: e.g. all of SS1 (Science + Art + Commercial) in one
   * workbook, ranked together by average rather than each stream only
   * against itself. Streams keep their own subject list on the page (a
   * Science student's report still only shows Science subjects) — only the
   * POSITION shown is the combined, whole-level rank.
   *
   * Ranking uses each student's own AVERAGE, not total, since streams take
   * different numbers of subjects — comparing raw totals across streams
   * with different subject counts would unfairly favour whichever stream
   * happens to take more subjects.
   */
  const doExportCombined = async () => {
    setBusy(true);
    setError(null);
    try {
      const isThirdTerm = term === "Third";

      const groupData = await Promise.all(
        levelClasses.map(async (cls) => {
          const resultKey = resultKeyFor(school?.currentSession, term, cls.id);
          const [studentsSnap, scoresByStudent, resultDocSnap, reportSnap] = await Promise.all([
            getDocs(query(collection(db, "schools", schoolId, "classes", cls.id, "students"), orderBy("fullName"))),
            fetchTermScores(schoolId, school?.currentSession, cls.id, term),
            getDoc(doc(db, "schools", schoolId, "results", resultKey)),
            getDocs(collection(db, "schools", schoolId, "results", resultKey, "reportMeta")),
          ]);
          const clsStudents = studentsSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((s) => !s.graduated);
          // Computed straight from the scores just fetched above — NOT read
          // from the class's stored meta/positions snapshot, which is only
          // refreshed when a teacher saves a score (or an admin clicks
          // "Recompute"). Relying on that snapshot here meant any class in
          // the level that hadn't triggered a recent recompute — or never
          // had one — silently dropped its students out of the combined
          // ranking below, leaving their Position blank on the export.
          // Computing it live guarantees every class's positions reflect
          // its current scores at export time, with nothing to go stale.
          const totalsForPositions = {};
          Object.entries(scoresByStudent).forEach(([sid, subs]) => {
            totalsForPositions[sid] = {};
            Object.entries(subs).forEach(([subId, s]) => {
              totalsForPositions[sid][subId] = s.total ?? 0;
            });
          });
          const clsPositions = computeClassPositions(totalsForPositions, (cls.subjects || []).map((s) => s.id));
          const clsResultData = resultDocSnap.exists() ? resultDocSnap.data() : {};
          const clsReportMeta = {};
          reportSnap.forEach((d) => (clsReportMeta[d.id] = d.data()));
          const clsAverages = computeSubjectClassAverages(
            Object.fromEntries(Object.entries(scoresByStudent).map(([sid, subs]) => [sid, Object.fromEntries(Object.entries(subs).map(([subId, s]) => [subId, s.total ?? 0]))])),
            (cls.subjects || []).map((s) => s.id)
          );

          return { cls, clsStudents, scoresByStudent, clsPositions, clsResultData, clsReportMeta, clsAverages };
        })
      );

      const combinedTotal = groupData.reduce((n, g) => n + g.clsStudents.length, 0);

      // Pool every student's own average (from their own stream's subjects)
      // and rank the whole level together.
      const averagesForRanking = [];
      groupData.forEach((g) => {
        g.clsStudents.forEach((s) => {
          const avg = g.clsPositions[s.id]?.overallAverage;
          if (avg != null) averagesForRanking.push({ studentId: s.id, score: avg });
        });
      });
      const combinedPositions = rankWithTies(averagesForRanking);

      // Pool every student's per-subject totals into one level-wide table too,
      // so a subject taken across every stream (e.g. English, Mathematics,
      // Civic Ed) is ranked against the WHOLE level rather than only within
      // its own class. Stream-specific subjects (e.g. Physics, Accounting)
      // still only have entries from the one class that teaches them, so
      // ranking them against this pooled table naturally reproduces the
      // same per-class result for those — this one table correctly covers
      // both cases without needing to tell general and stream subjects apart.
      const pooledTotals = {};
      const pooledSubjectIds = new Set();
      groupData.forEach((g) => {
        Object.entries(g.scoresByStudent).forEach(([sid, subs]) => {
          pooledTotals[sid] = pooledTotals[sid] || {};
          Object.entries(subs).forEach(([subId, s]) => {
            pooledTotals[sid][subId] = s.total ?? 0;
          });
        });
        (g.cls.subjects || []).forEach((s) => pooledSubjectIds.add(s.id));
      });
      const pooledPositions = computeClassPositions(pooledTotals, [...pooledSubjectIds]);

      const groups = [];
      let cumulativeForExport = {};

      for (const g of groupData) {
        const subjects = g.cls.subjects || [];
        const classInfo = {
          className: g.cls.name,
          level: g.cls.level,
          stream: g.cls.stream,
          session: school?.currentSession || "",
          term: `${term} Term`,
          noInClass: combinedTotal,
          termEndingDate: g.clsResultData.termEndingDate || "",
          nextTermBegins: g.clsResultData.nextTermBegins || "",
          subjects,
          weights: effectiveWeights(gradingScaleFor(g.cls.level), school?.weights),
        };

        const exportStudents = g.clsStudents.map((s) => {
          const pos = g.clsPositions[s.id] || {};
          const pooledPos = pooledPositions[s.id] || {};
          const meta = g.clsReportMeta[s.id] || {};
          const scores = {};
          subjects.forEach((subj) => {
            const raw = g.scoresByStudent[s.id]?.[subj.id] || {};
            scores[subj.id] = { ...raw, classAvg: g.clsAverages[subj.id] ?? "", position: pooledPos.subjectPositions?.[subj.id] || "" };
          });
          return {
            id: s.id,
            fullName: s.fullName || "",
            examNo: s.examNo || "",
            sex: s.sex || "",
            stateOfOrigin: s.stateOfOrigin || "",
            lga: s.lga || "",
            scores,
            overallPosition: combinedPositions[s.id] || pos.overallPosition || "",
            overallAverage: pos.overallAverage || "",
            behaviour: meta.behaviour || {},
            formMasterRemark: meta.formMasterRemark || "",
            principalRemark: meta.principalRemark || "",
            signatureDate: meta.signatureDate || "",
            promotionComment: meta.promotionComment || "",
          };
        });

        if (isThirdTerm) {
          const firstScores = await fetchTermScores(schoolId, school?.currentSession, g.cls.id, "First");
          const secondScores = await fetchTermScores(schoolId, school?.currentSession, g.cls.id, "Second");
          const termTotals = { First: {}, Second: {}, Third: {} };
          g.clsStudents.forEach((s) => {
            termTotals.First[s.id] = {};
            termTotals.Second[s.id] = {};
            termTotals.Third[s.id] = {};
            subjects.forEach((subj) => {
              termTotals.First[s.id][subj.id] = firstScores[s.id]?.[subj.id]?.total || 0;
              termTotals.Second[s.id][subj.id] = secondScores[s.id]?.[subj.id]?.total || 0;
              termTotals.Third[s.id][subj.id] = g.scoresByStudent[s.id]?.[subj.id]?.total || 0;
            });
            cumulativeForExport[s.id] = {};
            subjects.forEach((subj) => {
              cumulativeForExport[s.id][subj.id] = {
                term1: firstScores[s.id]?.[subj.id]?.total ?? "",
                term2: secondScores[s.id]?.[subj.id]?.total ?? "",
              };
            });
          });
          const cumulativePositions = computeCumulativeTerm(termTotals, subjects.map((s) => s.id));
          exportStudents.forEach((s) => {
            s.cumulativePosition = cumulativePositions[s.id]?.overallPosition || "";
          });
        }

        groups.push({ classInfo, students: exportStudents });
      }

      const buffer = await exportCombinedResults(
        {
          name: school?.name,
          address: school?.address,
          ministry: school?.ministry,
          logoUrl: school?.logoUrl,
          govLogoUrl: school?.govLogoUrl,
          formMasterSigUrl: school?.formMasterSigUrl,
          principalSigUrl: school?.principalSigUrl,
        },
        groups,
        { isThirdTerm, cumulative: isThirdTerm ? cumulativeForExport : undefined, sheetTitle: `${level} Combined` }
      );
      downloadWorkbook(buffer, `${level}_Combined_${term}_Term_Results.xlsx`);
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

      <div className="card-pad flex flex-col gap-3">
        <div className="inline-flex rounded-lg border border-slate-200 p-0.5 self-start text-sm">
          <button
            className={`px-3 py-1.5 rounded-md font-medium ${scope === "class" ? "bg-slate-900 text-white" : "text-slate-500"}`}
            onClick={() => setScope("class")}
          >
            Single class
          </button>
          <button
            className={`px-3 py-1.5 rounded-md font-medium ${scope === "level" ? "bg-slate-900 text-white" : "text-slate-500"}`}
            onClick={() => setScope("level")}
          >
            Whole level (combine streams)
          </button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          {scope === "class" ? (
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
          ) : (
            <div className="flex-1">
              <label className="field-label">Level</label>
              <select className="input" value={level} onChange={(e) => setLevel(e.target.value)}>
                {levels.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-400 mt-1">
                Combines {levelClasses.map((c) => c.name).join(", ") || "no classes yet"} into one export, ranked
                together by average — each student's own subjects still show as normal.
              </p>
            </div>
          )}
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
          {scope === "class" && (
            <>
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
            </>
          )}
          <div className="flex gap-2">
            {scope === "class" ? (
              <>
                <button className="btn-secondary" disabled={busy || !classId} onClick={recompute}>
                  Recompute positions
                </button>
                <button className="btn-primary" disabled={busy || !classId || students.length === 0} onClick={doExport}>
                  {busy ? "Working…" : "Export to Excel"}
                </button>
              </>
            ) : (
              <button className="btn-primary" disabled={busy || levelClasses.length === 0} onClick={doExportCombined}>
                {busy ? "Working…" : `Export combined ${level || ""}`}
              </button>
            )}
          </div>
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
      {scope === "class" && !classId && <p className="text-slate-400 text-sm">Create a class first.</p>}

      {scope === "class" && classId && subjects.length > 0 && (
        <div className="card-pad">
          <p className="field-label mb-2">Lock entries for {term} Term</p>
          <p className="text-xs text-slate-400 mb-3">
            Locking a subject stops the assigned teacher from editing this term's scores, without removing
            their assignment — they'll still see it next term. Unlock to allow edits again.
          </p>
          <div className="flex flex-wrap gap-2">
            {subjects.map((s) => {
              const locked = lockedSubjects.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleSubjectLock(s.id)}
                  className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                    locked ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {s.name} {locked ? "🔒 Locked" : "🔓 Open"}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {scope === "class" && classId && (
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
                      {lockedSubjects.includes(s.id) && <span title="Locked" className="ml-1">🔒</span>}
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