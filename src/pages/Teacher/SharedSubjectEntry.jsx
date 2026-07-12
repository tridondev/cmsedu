import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection, doc, getDocs, onSnapshot,
  query, orderBy, runTransaction, setDoc,
} from "firebase/firestore";
import { db } from "../../firebase/config";
import {
  computeSubjectTotal,
  gradeFor,
  computeClassPositions,
  computeSubjectClassAverages,
  rankWithTies,
  gradingScaleFor,
  effectiveWeights,
  defaultComponentMax,
} from "../../lib/resultEngine";

// Must match resultKeyFor() across the codebase
function resultKeyFor(session, term, classId) {
  const s = (session || "session").replace(/[^a-zA-Z0-9]+/g, "-");
  return `${s}_${term}_${classId}`;
}

/**
 * PERFORMANCE NOTE — split for the same reason as ScoreEntryGrid.jsx:
 * saveScore() writes only the one changed document (fast, constant-time).
 * The heavier recomputePositions() (a full re-read of the class's scores)
 * is debounced per resultKey via schedulePositionsRecompute() below, so
 * saving several students in a row — or across several classes in this
 * combined view — still only triggers one recompute per class per pause in
 * typing, instead of one per field.
 */
async function saveScore(schoolId, resultKey, studentId, subjectId, scoreDocData) {
  const scoreRef = doc(db, "schools", schoolId, "results", resultKey, "scores", `${studentId}_${subjectId}`);
  await setDoc(scoreRef, scoreDocData);
}

/**
 * Recomputes one class's average/position snapshot inside a transaction —
 * still race-safe: Firestore tracks every document read here and re-runs
 * this automatically if any of them change before it commits.
 */
async function recomputePositions(schoolId, resultKey) {
  const scoresCol = collection(db, "schools", schoolId, "results", resultKey, "scores");
  const positionsRef = doc(db, "schools", schoolId, "results", resultKey, "meta", "positions");

  await runTransaction(db, async (tx) => {
    const scoresSnap = await tx.get(scoresCol);
    const studentsScores = {};
    const subjectIds = new Set();
    scoresSnap.forEach((d) => {
      const [sId, subId] = d.id.split("_");
      studentsScores[sId] = studentsScores[sId] || {};
      studentsScores[sId][subId] = d.data().total || 0;
      subjectIds.add(subId);
    });
    const subjectIdList = [...subjectIds];
    const positions = computeClassPositions(studentsScores, subjectIdList);
    const subjectAverages = computeSubjectClassAverages(studentsScores, subjectIdList);
    tx.set(positionsRef, { positions, subjectAverages, computedAt: Date.now() }, { merge: true });
  });
}

// Per-resultKey debounce (per class, since this screen spans several
// classes) so rapid saves collapse into one recompute instead of many.
const positionsRecomputeTimers = {};
const POSITIONS_RECOMPUTE_DEBOUNCE_MS = 1200;

function schedulePositionsRecompute(schoolId, resultKey) {
  const key = `${schoolId}:${resultKey}`;
  clearTimeout(positionsRecomputeTimers[key]);
  positionsRecomputeTimers[key] = setTimeout(() => {
    delete positionsRecomputeTimers[key];
    recomputePositions(schoolId, resultKey).catch((err) =>
      console.error("Positions recompute failed for", resultKey, err)
    );
  }, POSITIONS_RECOMPUTE_DEBOUNCE_MS);
}

const FIELDS = [
  { key: "ca1",   label: "Ass 1"  },
  { key: "ca2",   label: "Ass 2"  },
  { key: "test1", label: "Test 1" },
  { key: "test2", label: "Test 2" },
  { key: "exam",  label: "Exam"   },
];
const TERMS = ["First", "Second", "Third"];
const AUTOSAVE_DEBOUNCE_MS = 700;

// ─────────────────────────────────────────────────────────────────────────────
//  SharedSubjectEntry
//
//  Allows a teacher to enter scores for ONE subject across MULTIPLE SS classes
//  (e.g. SS1 Science + SS1 Art + SS1 Commercial) in a single combined view,
//  instead of navigating into each class separately.
//
//  PROPS
//  ─────
//  schoolId      string    – from TeacherApp context
//  subjectId     string    – the shared subject (e.g. "english_language")
//  subjectName   string    – display label
//  classIds      string[]  – the classes to combine (e.g. ["ss1sci","ss1art","ss1com"])
//  onBack        fn        – called when the teacher clicks Back
//
//  HOW IT WORKS
//  ─────────────
//  Each class keeps its own result doc in Firestore (scores path:
//    schools/{schoolId}/results/{session}_{term}_{classId}/scores/{studentId}_{subjectId}
//  ) — nothing about the existing data model changes. SharedSubjectEntry just
//  loads all the classes' students together and saves to the correct
//  per-class doc for each row, exactly as ScoreEntryGrid would do if the
//  teacher visited each class one-by-one. The only difference is the UI:
//  students are grouped by class with a sticky header, and the teacher can
//  complete the whole subject in one sitting.
// ─────────────────────────────────────────────────────────────────────────────
export default function SharedSubjectEntry({
  schoolId,
  subjectId,
  subjectName,
  classIds,
  onBack,
}) {
  const navigate = useNavigate();

  const [schoolData, setSchoolData]   = useState(null);
  const [term, setTerm]               = useState(null);
  const [session, setSession]         = useState("");
  const [classInfoMap, setClassInfoMap] = useState({}); // classId -> class doc data
  const [studentsByClass, setStudentsByClass] = useState({}); // classId -> [{id, fullName, …}]
  const [scores, setScores]           = useState({});   // `${classId}:${studentId}` -> score fields
  const [rowStatus, setRowStatus]     = useState({});   // same key -> status
  const [loading, setLoading]         = useState(true);
  const [isOnline, setIsOnline]       = useState(navigator.onLine);
  const [activeGroup, setActiveGroup] = useState(null); // classId being highlighted/scrolled to
  // Combined position/average for this subject, computed ACROSS all the
  // combined classes together (not per class) — see combinedSubjectStats
  // below. This is what should show in the table, so streams don't each
  // show their own separate "1st".

  const debounceTimers = useRef({});
  const inputRefs      = useRef({}); // `${classId}:${studentIdx}:${fieldIdx}` -> element
  const rowStatusRef   = useRef({});
  const scoresRef      = useRef({});
  const hasUnsavedRef  = useRef(false);

  useEffect(() => { rowStatusRef.current = rowStatus; }, [rowStatus]);
  useEffect(() => { scoresRef.current = scores; }, [scores]);
  useEffect(() => {
    hasUnsavedRef.current = Object.values(rowStatus).some(
      (s) => s === "dirty" || s === "saving" || s === "error"
    );
  }, [rowStatus]);

  // ── School / term / session ─────────────────────────────────────────────
  useEffect(() => {
    return onSnapshot(doc(db, "schools", schoolId), (snap) => {
      const data = snap.exists() ? snap.data() : {};
      setSchoolData(data);
      setTerm((prev) => prev ?? data.currentTerm ?? "First");
      setSession(data.currentSession || "");
    });
  }, [schoolId]);

  // ── Class metadata ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!classIds?.length) return;
    const unsubs = classIds.map((cId) =>
      onSnapshot(doc(db, "schools", schoolId, "classes", cId), (snap) => {
        setClassInfoMap((prev) => ({
          ...prev,
          [cId]: snap.exists() ? snap.data() : null,
        }));
      })
    );
    return () => unsubs.forEach((u) => u());
  }, [schoolId, classIds]);

  // ── Student rosters ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!classIds?.length) return;
    const unsubs = classIds.map((cId) =>
      onSnapshot(
        query(collection(db, "schools", schoolId, "classes", cId, "students"), orderBy("fullName")),
        (snap) => {
          setStudentsByClass((prev) => ({
            ...prev,
            [cId]: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
          }));
        }
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [schoolId, classIds]);

  // ── Preload existing scores for this subject across all classes ─────────
  // One request per class (not one per student) — the old version did a
  // separate getDoc() for every student in every class, which for a few
  // classes of ~30 students each meant 80-100+ simultaneous round trips
  // firing the moment this screen opened. That was the main source of the
  // slow, laggy load. Now each class's whole scores subcollection is read
  // once and filtered client-side down to just this subject's rows.
  useEffect(() => {
    if (!term || !session || !classIds?.length) return;
    let cancelled = false;
    (async () => {
      const nextScores = {};
      const nextStatus = {};
      const suffix = `_${subjectId}`;
      await Promise.all(
        classIds.map(async (cId) => {
          const resultKey = resultKeyFor(session, term, cId);
          const scoresSnap = await getDocs(
            collection(db, "schools", schoolId, "results", resultKey, "scores")
          );
          scoresSnap.forEach((d) => {
            if (!d.id.endsWith(suffix)) return;
            const studentId = d.id.slice(0, -suffix.length);
            const key = `${cId}:${studentId}`;
            nextScores[key] = d.data();
            nextStatus[key] = "saved";
          });
        })
      );
      if (cancelled) return;
      setScores(nextScores);
      setRowStatus(nextStatus);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [schoolId, subjectId, classIds, term, session]);

  // ── Combined position/average across ALL combined classes ───────────────
  // Ranks every student from every stream together for this one subject
  // (e.g. SS1 Science + Art + Commercial as a single group), so the table
  // shows one continuous class rank instead of each stream separately
  // producing its own "1st". Totals are computed the same way the visible
  // "Total" column is (live, from each row's entered fields + that
  // student's own class weights) so this updates instantly as the teacher
  // types, instead of waiting on a save + Firestore round trip. Rows with
  // nothing entered yet are excluded rather than counted as a 0.
  const combinedSubjectStats = useMemo(() => {
    const entries = [];
    (classIds || []).forEach((cId) => {
      const gradingScale = gradingScaleFor(classInfoMap[cId]?.level);
      const weights = effectiveWeights(gradingScale, schoolData?.weights);
      (studentsByClass[cId] || []).forEach((s) => {
        const key = `${cId}:${s.id}`;
        const row = scores[key] || {};
        const hasEntry = FIELDS.some((f) => row[f.key] != null && row[f.key] !== "");
        if (!hasEntry) return;
        const total = computeSubjectTotal(row, gradingScale, undefined, weights);
        entries.push({ studentId: key, score: total });
      });
    });
    const positions = rankWithTies(entries);
    const average = entries.length
      ? Math.round((entries.reduce((sum, e) => sum + e.score, 0) / entries.length) * 100) / 100
      : "";
    return { positions, average };
  }, [classIds, classInfoMap, studentsByClass, scores, schoolData]);

  // ── Beforeunload guard ──────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (!hasUnsavedRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // ── Online/offline ──────────────────────────────────────────────────────
  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      Object.entries(rowStatusRef.current).forEach(([key, status]) => {
        if (status === "error") {
          const [cId, studentId] = key.split(":");
          saveRow(cId, studentId);
        }
      });
    };
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const saveRow = useCallback(
    async (classId, studentId) => {
      if (!term || !session) return;
      const key = `${classId}:${studentId}`;
      setRowStatus((prev) => ({ ...prev, [key]: "saving" }));

      try {
        const classInfo   = classInfoMap[classId] || {};
        const gradingScale = gradingScaleFor(classInfo.level);
        const weights      = effectiveWeights(gradingScale, schoolData?.weights);
        const raw          = scoresRef.current[key] || {};
        const total        = computeSubjectTotal(raw, gradingScale, undefined, weights);
        const { grade, remark } = gradeFor(total, gradingScale);
        const resultKey = resultKeyFor(session, term, classId);

        await saveScore(schoolId, resultKey, studentId, subjectId, {
          ...raw, total, grade, remark, updatedAt: Date.now(),
        });
        setRowStatus((prev) => ({ ...prev, [key]: "saved" }));
        schedulePositionsRecompute(schoolId, resultKey);
      } catch (err) {
        console.error("SharedSubjectEntry save failed:", classId, studentId, err);
        setRowStatus((prev) => ({ ...prev, [key]: "error" }));
      }
    },
    [schoolId, subjectId, term, session, classInfoMap, schoolData]
  );

  const scheduleAutosave = (classId, studentId) => {
    const key = `${classId}:${studentId}`;
    if (debounceTimers.current[key]) clearTimeout(debounceTimers.current[key]);
    debounceTimers.current[key] = setTimeout(() => {
      saveRow(classId, studentId);
      delete debounceTimers.current[key];
    }, AUTOSAVE_DEBOUNCE_MS);
  };

  const updateField = (classId, studentId, field, value) => {
    const key = `${classId}:${studentId}`;
    setScores((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: value === "" ? undefined : Number(value),
      },
    }));
    setRowStatus((prev) => ({ ...prev, [key]: "dirty" }));
    scheduleAutosave(classId, studentId);
  };

  const handleKeyDown = (e, classId, studentIdx, fieldIdx, totalStudents) => {
    if (e.key !== "Enter") return;
    e.preventDefault();

    let nextClassId    = classId;
    let nextStudentIdx = studentIdx;
    let nextFieldIdx   = fieldIdx + 1;

    if (nextFieldIdx >= FIELDS.length) {
      nextFieldIdx = 0;
      nextStudentIdx += 1;
    }
    if (nextStudentIdx >= totalStudents) {
      // Move to first student of next class
      const classIdxInList = classIds.indexOf(classId);
      if (classIdxInList < classIds.length - 1) {
        nextClassId    = classIds[classIdxInList + 1];
        nextStudentIdx = 0;
        nextFieldIdx   = 0;
      } else {
        e.target.blur();
        return;
      }
    }

    const ref = inputRefs.current[`${nextClassId}:${nextStudentIdx}:${nextFieldIdx}`];
    if (ref) ref.focus();
  };

  const confirmLeave = () => {
    if (!hasUnsavedRef.current) return true;
    return window.confirm("Some scores haven't finished saving. Leave anyway?");
  };

  // ── Derived stats ───────────────────────────────────────────────────────
  const { totalStudents, savedCount, errorCount } = useMemo(() => {
    let total = 0, saved = 0, errors = 0;
    classIds?.forEach((cId) => {
      (studentsByClass[cId] || []).forEach((s) => {
        total++;
        const st = rowStatus[`${cId}:${s.id}`];
        if (st === "saved") saved++;
        if (st === "error") errors++;
      });
    });
    return { totalStudents: total, savedCount: saved, errorCount: errors };
  }, [classIds, studentsByClass, rowStatus]);

  const progressPct = totalStudents ? Math.round((savedCount / totalStudents) * 100) : 0;

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card-pad h-14 animate-pulse bg-slate-100" />
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* ── Back + title ── */}
      <button
        onClick={() => { if (confirmLeave()) onBack?.(); }}
        className="text-sm text-brand-600 font-medium mb-3 inline-flex items-center gap-1"
      >
        ← Back to my classes
      </button>
      <h2 className="page-title">{subjectName} — Combined Entry</h2>
      <p className="page-subtitle text-slate-500 text-sm mb-3">
        Entering scores across {classIds?.length} class{classIds?.length !== 1 ? "es" : ""}:{" "}
        {classIds?.map((cId) => classInfoMap[cId]?.name || cId).join(", ")}
      </p>

      {/* ── Term selector ── */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="flex items-center gap-2">
          <label className="field-label mb-0">Term:</label>
          <select
            className="input w-auto"
            value={term}
            onChange={(e) => {
              if (!confirmLeave()) return;
              setTerm(e.target.value);
            }}
          >
            {TERMS.map((t) => (
              <option key={t} value={t}>{t} Term</option>
            ))}
          </select>
        </div>
        {term !== (schoolData?.currentTerm || "First") && (
          <span className="text-xs text-amber-600">
            Not the current term ({schoolData?.currentTerm || "First"}) — saves normally under {term} Term.
          </span>
        )}
      </div>

      {/* ── Class jump tabs ── */}
      {classIds?.length > 1 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {classIds.map((cId) => (
            <button
              key={cId}
              className={`btn-sm ${activeGroup === cId ? "btn-primary" : "btn-secondary"}`}
              onClick={() => {
                setActiveGroup(cId);
                document.getElementById(`class-group-${cId}`)?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              {classInfoMap[cId]?.name || cId}
            </button>
          ))}
        </div>
      )}

      {/* ── Progress bar ── */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
          <span>{savedCount} of {totalStudents} students entered</span>
          <span>{progressPct}%</span>
        </div>
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full bg-brand-600 rounded-full transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* ── Alerts ── */}
      {!isOnline && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
          You're offline. Scores will save automatically once you're back online.
        </div>
      )}
      {errorCount > 0 && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 flex items-center justify-between gap-3">
          <span>{errorCount} row{errorCount !== 1 ? "s" : ""} couldn't save.</span>
          <button
            className="btn-sm btn-secondary"
            onClick={() => {
              Object.entries(rowStatus).forEach(([key, st]) => {
                if (st === "error") {
                  const [cId, studentId] = key.split(":");
                  saveRow(cId, studentId);
                }
              });
            }}
          >
            Retry all
          </button>
        </div>
      )}

      {/* ── Per-class groups ── */}
      {classIds?.map((cId) => {
        const clsInfo   = classInfoMap[cId];
        const students  = studentsByClass[cId] || [];
        const gradingScale  = gradingScaleFor(clsInfo?.level);
        const weights       = effectiveWeights(gradingScale, schoolData?.weights);
        const componentMax  = defaultComponentMax(gradingScale);

        const clsSaved  = students.filter((s) => rowStatus[`${cId}:${s.id}`] === "saved").length;
        const clsPct    = students.length ? Math.round((clsSaved / students.length) * 100) : 0;

        return (
          <div key={cId} id={`class-group-${cId}`} className="mb-8">
            {/* Class header */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <h3 className="font-semibold text-slate-900 text-base">
                  {clsInfo?.name || cId}
                  {clsInfo?.stream && (
                    <span className="ml-2 text-xs font-normal text-slate-500">({clsInfo.stream})</span>
                  )}
                </h3>
                <span className="text-xs text-slate-400">{clsSaved}/{students.length} saved</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-20 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full bg-brand-600 rounded-full transition-all"
                    style={{ width: `${clsPct}%` }}
                  />
                </div>
                <span className="text-xs text-slate-400">{clsPct}%</span>
              </div>
            </div>

            {students.length === 0 ? (
              <p className="text-sm text-slate-400 card-pad">No students in this class yet.</p>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden sm:block table-wrap">
                  <table className="table-modern">
                    <thead>
                      <tr>
                        <th>Student</th>
                        {FIELDS.map((f) => (
                          <th key={f.key} className="text-center">
                            {f.label}
                            <span className="block text-[10px] font-normal text-slate-400">
                              max {componentMax[f.key]}
                            </span>
                          </th>
                        ))}
                        <th className="text-center">Total</th>
                        <th className="text-center">
                          Class avg
                          <span className="block text-[10px] font-normal text-slate-400">combined, this subject</span>
                        </th>
                        <th className="text-center">
                          Position
                          <span className="block text-[10px] font-normal text-slate-400">combined</span>
                        </th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((s, studentIdx) => {
                        const key  = `${cId}:${s.id}`;
                        const row  = scores[key] || {};
                        const total = computeSubjectTotal(row, gradingScale, undefined, weights);
                        const status = rowStatus[key];
                        const combinedPosition = combinedSubjectStats.positions[key];
                        return (
                          <tr key={s.id}>
                            <td className="font-medium text-slate-800">{s.fullName}</td>
                            {FIELDS.map((f, fieldIdx) => {
                              const val    = row[f.key];
                              const overMax = val != null && val > componentMax[f.key];
                              return (
                                <td key={f.key} className="text-center">
                                  <input
                                    ref={(el) =>
                                      (inputRefs.current[`${cId}:${studentIdx}:${fieldIdx}`] = el)
                                    }
                                    type="number"
                                    min={0}
                                    max={componentMax[f.key]}
                                    className={`input w-16 py-1.5 text-center mx-auto ${
                                      overMax ? "border-red-400 text-red-600" : ""
                                    }`}
                                    value={val ?? ""}
                                    onChange={(e) => updateField(cId, s.id, f.key, e.target.value)}
                                    onKeyDown={(e) =>
                                      handleKeyDown(e, cId, studentIdx, fieldIdx, students.length)
                                    }
                                  />
                                  {overMax && (
                                    <span className="block text-[10px] text-red-500 mt-0.5">
                                      max {componentMax[f.key]}
                                    </span>
                                  )}
                                </td>
                              );
                            })}
                            <td className="text-center font-semibold text-slate-900">{total}</td>
                            <td className="text-center text-slate-600">{combinedSubjectStats.average ?? "—"}</td>
                            <td className="text-center text-slate-600">{combinedPosition ?? "—"}</td>
                            <td className="text-center">
                              <StatusBadge
                                status={status}
                                onRetry={() => saveRow(cId, s.id)}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="sm:hidden flex flex-col gap-3">
                  {students.map((s, studentIdx) => {
                    const key   = `${cId}:${s.id}`;
                    const row   = scores[key] || {};
                    const total = computeSubjectTotal(row, gradingScale, undefined, weights);
                    const status = rowStatus[key];
                    const combinedPosition = combinedSubjectStats.positions[key];
                    return (
                      <div key={s.id} className="row-card">
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-semibold text-slate-900 text-sm">{s.fullName}</p>
                          <span className="badge-brand">{total} pts</span>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Class avg: <span className="font-medium text-slate-700">{combinedSubjectStats.average ?? "—"}</span>
                          {" · "}
                          Position: <span className="font-medium text-slate-700">{combinedPosition ?? "—"}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-2">
                          {FIELDS.map((f, fieldIdx) => {
                            const val    = row[f.key];
                            const overMax = val != null && val > componentMax[f.key];
                            return (
                              <div key={f.key}>
                                <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                  {f.label}{" "}
                                  <span className="normal-case font-normal">/{componentMax[f.key]}</span>
                                </label>
                                <input
                                  ref={(el) =>
                                    (inputRefs.current[`${cId}:${studentIdx}:${fieldIdx}`] = el)
                                  }
                                  type="number"
                                  min={0}
                                  max={componentMax[f.key]}
                                  className={`input py-1.5 text-center mt-0.5 ${
                                    overMax ? "border-red-400 text-red-600" : ""
                                  }`}
                                  value={val ?? ""}
                                  onChange={(e) => updateField(cId, s.id, f.key, e.target.value)}
                                  onKeyDown={(e) =>
                                    handleKeyDown(e, cId, studentIdx, fieldIdx, students.length)
                                  }
                                />
                              </div>
                            );
                          })}
                        </div>
                        <div className="mt-3 flex items-center justify-between">
                          <StatusBadge status={status} onRetry={() => saveRow(cId, s.id)} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StatusBadge({ status, onRetry }) {
  if (status === "saving") return <span className="text-xs text-slate-400">Saving…</span>;
  if (status === "saved")  return <span className="text-xs text-emerald-600 font-medium">Saved ✓</span>;
  if (status === "dirty")  return <span className="text-xs text-slate-400">Pending…</span>;
  if (status === "error")
    return (
      <button className="text-xs text-red-600 font-medium underline" onClick={onRetry}>
        Failed — retry
      </button>
    );
  return <span className="text-xs text-slate-300">—</span>;
}
