import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { collection, doc, getDocs, onSnapshot, runTransaction, setDoc } from "firebase/firestore";
import { db } from "../../firebase/config";
import { useTeacherLock } from "../../hooks/useTeacherLock";
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

/** Must match resultKeyFor() in SchoolAdmin/Results.jsx — keeps each academic session's scores separate. */
function resultKeyFor(session, term, classId) {
  const s = (session || "session").replace(/[^a-zA-Z0-9]+/g, "-");
  return `${s}_${term}_${classId}`;
}

/**
 * PERFORMANCE NOTE — why this is split into two functions:
 * saveScore() is a single, fast document write — nothing else. It used to
 * be bundled into one transaction with recomputePositions() below, which
 * meant every single field a teacher typed (after the autosave debounce)
 * triggered a full re-read of every score in the class just to refresh the
 * positions snapshot. For a class of 40 students × 5 subjects, that's up to
 * 200 document reads on every row save — the main source of lag while
 * actively entering scores, especially on slower connections.
 *
 * Now saveScore() only writes the one document that changed (fast,
 * constant-time), and schedulePositionsRecompute() (below) coalesces the
 * heavier recompute so it only runs once, ~1.2s after the teacher pauses —
 * so filling in a whole row, or several rows in a row, still only costs one
 * recompute instead of one per field.
 */
async function saveScore(schoolId, resultKey, studentId, subjectId, scoreDocData) {
  const scoreRef = doc(db, "schools", schoolId, "results", resultKey, "scores", `${studentId}_${subjectId}`);
  await setDoc(scoreRef, scoreDocData);
}

/**
 * Recomputes the class's average/position snapshot inside a transaction —
 * still race-safe the same way as before (see prior version of this file):
 * Firestore tracks every document read here, and re-runs this whole
 * function automatically if any of them change before it commits, so a
 * recompute never commits from a stale read even if two teachers happen to
 * trigger one at close to the same moment.
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

// Per-resultKey debounce so many rapid score saves (typing across a whole
// class) collapse into a single positions recompute instead of one per row.
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
  { key: "ca1", label: "Ass 1" },
  { key: "ca2", label: "Ass 2" },
  { key: "test1", label: "Test 1" },
  { key: "test2", label: "Test 2" },
  { key: "exam", label: "Exam" },
];

const TERMS = ["First", "Second", "Third"];
const AUTOSAVE_DEBOUNCE_MS = 700;

export default function ScoreEntryGrid({ schoolId }) {
  const { classId, subjectId } = useParams();
  const navigate = useNavigate();
  const locked = useTeacherLock(schoolId);
  const lockedRef = useRef(false);
  useEffect(() => {
    lockedRef.current = locked;
  }, [locked]);
  const [students, setStudents] = useState([]);
  const [scores, setScores] = useState({});
  const [classInfo, setClassInfo] = useState(null);
  const [term, setTerm] = useState(null);
  const [session, setSession] = useState(null);
  const [weights, setWeights] = useState(null);
  // Per-student save state: 'saved' | 'dirty' | 'saving' | 'error' | undefined (untouched, no data)
  const [rowStatus, setRowStatus] = useState({});
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  // Live class-average/position for THIS subject, computed client-side from
  // whatever's currently in `scores` — same approach as the combined
  // multi-class entry screen. Updates instantly as the teacher types,
  // instead of waiting on a save + the debounced Firestore recompute below
  // (which also wouldn't reflect this subject at all until a save has
  // happened at least once). Students with nothing entered yet are left
  // out of the ranking/average rather than counted as a 0.

  const gradingScale = gradingScaleFor(classInfo?.level);
  const subject = classInfo?.subjects?.find((s) => s.id === subjectId);
  const resultKey = term && classId ? resultKeyFor(session, term, classId) : null;
  const componentMax = defaultComponentMax(gradingScale);

  const [schoolData, setSchoolData] = useState(null);
  const [classLoaded, setClassLoaded] = useState(false);

  const debounceTimers = useRef({}); // studentId -> timeoutId
  const inputRefs = useRef({}); // "studentIndex:fieldIndex" -> element
  // Kept in a ref (not just state) so the beforeunload handler — registered
  // once on mount — always reads the LATEST unsaved state, not whatever it
  // was when the effect first ran.
  const hasUnsavedRef = useRef(false);
  // rowStatus changes on every keystroke's debounce cycle; mirrored into a
  // ref so effects that only need to READ the latest value (online-retry,
  // beforeunload) don't need to be torn down and re-registered every time.
  const rowStatusRef = useRef({});
  useEffect(() => {
    rowStatusRef.current = rowStatus;
    hasUnsavedRef.current = Object.values(rowStatus).some((s) => s === "dirty" || s === "saving" || s === "error");
  }, [rowStatus]);

  // Live: current term/session/grading weights — reflects admin changes
  // (e.g. switching term, editing weights) without a page refresh. `term`
  // itself is only DEFAULTED from the school's currentTerm on first load —
  // after that it's the teacher's own selection (see the Term dropdown
  // below), so it doesn't get reset every time the school doc changes for
  // some unrelated reason.
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "schools", schoolId), (snap) => {
      const data = snap.exists() ? snap.data() : {};
      setSchoolData(data);
      setTerm((prev) => prev ?? data.currentTerm ?? "First");
      setSession(data.currentSession || "");
    });
    return unsub;
  }, [schoolId]);

  // Live: class name/level/subjects — reflects admin edits (like a newly
  // added subject) immediately.
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "schools", schoolId, "classes", classId), (snap) => {
      setClassInfo(snap.exists() ? snap.data() : null);
      setClassLoaded(true);
    });
    return unsub;
  }, [schoolId, classId]);

  // Live: student roster for this class.
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "schools", schoolId, "classes", classId, "students"), (snap) => {
      setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [schoolId, classId]);

  useEffect(() => {
    if (classInfo !== null) setWeights(effectiveWeights(gradingScaleFor(classInfo?.level), schoolData?.weights));
  }, [classInfo, schoolData]);

  const subjectStats = useMemo(() => {
    const entries = students
      .map((s) => {
        const row = scores[s.id] || {};
        const hasEntry = FIELDS.some((f) => row[f.key] != null && row[f.key] !== "");
        if (!hasEntry) return null;
        const total = computeSubjectTotal(row, gradingScale, undefined, weights);
        return { studentId: s.id, score: total };
      })
      .filter(Boolean);
    const positions = rankWithTies(entries);
    const average = entries.length
      ? Math.round((entries.reduce((sum, e) => sum + e.score, 0) / entries.length) * 100) / 100
      : "";
    return { positions, average };
  }, [students, scores, gradingScale, weights]);

  // Preload any scores already entered this term for this subject. Keyed
  // only on resultKey/subjectId (i.e. the teacher actually switching term or
  // subject) — NOT on the live `students` roster listener above. Re-running
  // this on every roster snapshot would silently overwrite any in-progress,
  // not-yet-saved edits whenever the roster happened to re-fire for an
  // unrelated reason (e.g. the admin editing a different student's bio).
  useEffect(() => {
    if (!classLoaded || !resultKey) return;
    let cancelled = false;
    (async () => {
      // Single request for every score already saved this term/subject —
      // replaces what used to be one getDoc() per student (an N+1 network
      // round trip that scaled with class size and was the main source of
      // load-time lag, especially on slower connections).
      const scoresSnap = await getDocs(
        collection(db, "schools", schoolId, "results", resultKey, "scores")
      );
      const suffix = `_${subjectId}`;
      const existing = {};
      const nextStatus = {};
      scoresSnap.forEach((d) => {
        if (!d.id.endsWith(suffix)) return;
        const studentId = d.id.slice(0, -suffix.length);
        existing[studentId] = d.data();
        nextStatus[studentId] = "saved";
      });
      if (cancelled) return;
      setScores(existing);
      setRowStatus(nextStatus);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [schoolId, classId, classLoaded, subjectId, resultKey]);

  // Browser-level guard: warn before closing the tab / refreshing / typing a
  // new URL while there are unsaved or failed-to-save rows. Registered once;
  // reads hasUnsavedRef so it always sees the current state.
  useEffect(() => {
    const handler = (e) => {
      if (!hasUnsavedRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // Refs mirroring latest scores/weights so saveRow (memoized with useCallback,
  // called from debounce timeouts) always reads current values instead of a
  // stale closure from whenever the timer was scheduled.
  const scoresRef = useRef({});
  const weightsRef = useRef(null);
  useEffect(() => {
    scoresRef.current = scores;
  }, [scores]);
  useEffect(() => {
    weightsRef.current = weights;
  }, [weights]);

  const saveRow = useCallback(
    async (studentId) => {
      if (!resultKey) return;
      if (lockedRef.current) return; // account locked by admin — no writes allowed
      setRowStatus((prev) => ({ ...prev, [studentId]: "saving" }));
      try {
        const raw = scoresRef.current[studentId] || {};
        const total = computeSubjectTotal(raw, gradingScale, undefined, weightsRef.current);
        const { grade, remark } = gradeFor(total, gradingScale);
        await saveScore(schoolId, resultKey, studentId, subjectId, {
          ...raw,
          total,
          grade,
          remark,
          updatedAt: Date.now(),
        });
        setRowStatus((prev) => ({ ...prev, [studentId]: "saved" }));
        schedulePositionsRecompute(schoolId, resultKey);
      } catch (err) {
        console.error("Save failed for", studentId, err);
        setRowStatus((prev) => ({ ...prev, [studentId]: "error" }));
      }
    },
    [schoolId, resultKey, subjectId, gradingScale]
  );

  // Connectivity: flip a banner when offline, and auto-retry anything that
  // failed to save the moment we're back online — a teacher shouldn't have
  // to notice and manually retry every row after a signal drop.
  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      Object.entries(rowStatusRef.current).forEach(([studentId, status]) => {
        if (status === "error") saveRow(studentId);
      });
    };
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [saveRow]);

  const scheduleAutosave = (studentId) => {
    if (debounceTimers.current[studentId]) clearTimeout(debounceTimers.current[studentId]);
    debounceTimers.current[studentId] = setTimeout(() => {
      saveRow(studentId);
      delete debounceTimers.current[studentId];
    }, AUTOSAVE_DEBOUNCE_MS);
  };

  const updateField = (studentId, field, value) => {
    if (locked) return; // belt-and-braces: inputs are disabled, but guard the handler too
    setScores((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], [field]: value === "" ? undefined : Number(value) },
    }));
    setRowStatus((prev) => ({ ...prev, [studentId]: "dirty" }));
    scheduleAutosave(studentId);
  };

  // Enter (or the mobile keyboard's "Next"/"Go") jumps straight to the next
  // field in reading order — same field of the next student after the last
  // field of a row — so a teacher can fill the whole sheet without lifting
  // their hand to tap between cells.
  const handleKeyDown = (e, studentIdx, fieldIdx) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    let nextStudent = studentIdx;
    let nextField = fieldIdx + 1;
    if (nextField >= FIELDS.length) {
      nextField = 0;
      nextStudent += 1;
    }
    const next = inputRefs.current[`${nextStudent}:${nextField}`];
    if (next) next.focus();
    else e.target.blur(); // last field of last student — nothing further to jump to
  };

  const confirmLeaveIfUnsaved = () => {
    if (!hasUnsavedRef.current) return true;
    return window.confirm("Some scores haven't finished saving yet. Leave this page anyway?");
  };

  const goBack = () => {
    if (!confirmLeaveIfUnsaved()) return;
    navigate("..");
  };

  const changeTerm = (newTerm) => {
    if (!confirmLeaveIfUnsaved()) return;
    setTerm(newTerm);
  };

  const enteredCount = useMemo(() => Object.values(rowStatus).filter((s) => s === "saved").length, [rowStatus]);
  const errorCount = useMemo(() => Object.values(rowStatus).filter((s) => s === "error").length, [rowStatus]);
  const progressPct = students.length ? Math.round((enteredCount / students.length) * 100) : 0;

  const retryAllErrors = () => {
    Object.entries(rowStatus).forEach(([studentId, status]) => {
      if (status === "error") saveRow(studentId);
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card-pad h-14 animate-pulse bg-slate-100" />
        ))}
      </div>
    );
  }
  if (!classInfo) return <p className="text-red-600">Class not found.</p>;

  return (
    <div>
      <button onClick={goBack} className="text-sm text-brand-600 font-medium mb-3 inline-flex items-center gap-1">
        ← Back to my classes
      </button>
      <h2 className="page-title">
        {classInfo.name} — {subject?.name || subjectId}
      </h2>

      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="flex items-center gap-2">
          <label className="field-label mb-0">Term:</label>
          <select className="input w-auto" value={term} onChange={(e) => changeTerm(e.target.value)}>
            {TERMS.map((t) => (
              <option key={t} value={t}>
                {t} Term
              </option>
            ))}
          </select>
        </div>
        {term !== (schoolData?.currentTerm || "First") && (
          <span className="text-xs text-amber-600">
            Not the school's current term ({schoolData?.currentTerm || "First"} Term) — scores still save normally under {term} Term.
          </span>
        )}
      </div>

      {/* Live progress */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
          <span>
            {enteredCount} of {students.length} students entered
          </span>
          <span>{progressPct}%</span>
        </div>
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div className="h-full bg-brand-600 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {locked && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          🔒 Your account is locked by the school admin. You can view scores already entered, but no changes can be saved until an admin unlocks your account.
        </div>
      )}
      {!isOnline && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
          You're offline. Scores you enter will save automatically once your connection is back.
        </div>
      )}
      {errorCount > 0 && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 flex items-center justify-between gap-3">
          <span>
            {errorCount} row{errorCount === 1 ? "" : "s"} couldn't save — check your connection.
          </span>
          <button className="btn-sm btn-secondary" onClick={retryAllErrors} disabled={locked}>
            Retry now
          </button>
        </div>
      )}

      {/* Desktop / tablet: table */}
      <div className="hidden sm:block table-wrap">
        <table className="table-modern">
          <thead>
            <tr>
              <th>Student</th>
              {FIELDS.map((f) => (
                <th key={f.key} className="text-center">
                  {f.label}
                  <span className="block text-[10px] font-normal text-slate-400">max {componentMax[f.key]}</span>
                </th>
              ))}
              <th className="text-center">Total</th>
              <th className="text-center">
                Class avg
                <span className="block text-[10px] font-normal text-slate-400">{subject?.name || "this subject"}</span>
              </th>
              <th className="text-center">Position</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {students.map((s, studentIdx) => {
              const row = scores[s.id] || {};
              const total = computeSubjectTotal(row, gradingScale, undefined, weights);
              const status = rowStatus[s.id];
              return (
                <tr key={s.id}>
                  <td className="font-medium text-slate-800">{s.fullName}</td>
                  {FIELDS.map((f, fieldIdx) => {
                    const val = row[f.key];
                    const overMax = val != null && val > componentMax[f.key];
                    return (
                      <td key={f.key} className="text-center">
                        <input
                          ref={(el) => (inputRefs.current[`${studentIdx}:${fieldIdx}`] = el)}
                          type="number"
                          min={0}
                          max={componentMax[f.key]}
                          disabled={locked}
                          className={`input w-16 py-1.5 text-center mx-auto ${overMax ? "border-red-400 text-red-600" : ""}`}
                          value={val ?? ""}
                          onChange={(e) => updateField(s.id, f.key, e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, studentIdx, fieldIdx)}
                        />
                        {overMax && <span className="block text-[10px] text-red-500 mt-0.5">max {componentMax[f.key]}</span>}
                      </td>
                    );
                  })}
                  <td className="text-center font-semibold text-slate-900">{total}</td>
                  <td className="text-center text-slate-600">{subjectStats.average ?? "—"}</td>
                  <td className="text-center text-slate-600">{subjectStats.positions[s.id] ?? "—"}</td>
                  <td className="text-center">
                    <StatusBadge status={status} onRetry={() => saveRow(s.id)} />
                  </td>
                </tr>
              );
            })}
            {students.length === 0 && (
              <tr>
                <td colSpan={FIELDS.length + 5} className="p-6 text-center text-slate-400">
                  No students in this class yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile: stacked cards */}
      <div className="sm:hidden flex flex-col gap-3">
        {students.map((s, studentIdx) => {
          const row = scores[s.id] || {};
          const total = computeSubjectTotal(row, gradingScale, undefined, weights);
          const status = rowStatus[s.id];
          return (
            <div key={s.id} className="row-card">
              <div className="flex items-center justify-between mb-1">
                <p className="font-semibold text-slate-900 text-sm">{s.fullName}</p>
                <span className="badge-brand">{total} pts</span>
              </div>
              <div className="text-[11px] text-slate-500">
                Class avg: <span className="font-medium text-slate-700">{subjectStats.average ?? "—"}</span>
                {" · "}
                Position: <span className="font-medium text-slate-700">{subjectStats.positions[s.id] ?? "—"}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {FIELDS.map((f, fieldIdx) => {
                  const val = row[f.key];
                  const overMax = val != null && val > componentMax[f.key];
                  return (
                    <div key={f.key}>
                      <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        {f.label} <span className="normal-case font-normal">/{componentMax[f.key]}</span>
                      </label>
                      <input
                        ref={(el) => (inputRefs.current[`${studentIdx}:${fieldIdx}`] = el)}
                        type="number"
                        min={0}
                        max={componentMax[f.key]}
                        disabled={locked}
                        className={`input py-1.5 text-center mt-0.5 ${overMax ? "border-red-400 text-red-600" : ""}`}
                        value={val ?? ""}
                        onChange={(e) => updateField(s.id, f.key, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, studentIdx, fieldIdx)}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center justify-between">
                <StatusBadge status={status} onRetry={() => saveRow(s.id)} />
              </div>
            </div>
          );
        })}
        {students.length === 0 && <div className="card-pad text-center text-slate-400 text-sm">No students in this class yet.</div>}
      </div>
    </div>
  );
}

function StatusBadge({ status, onRetry }) {
  if (status === "saving") return <span className="text-xs text-slate-400">Saving…</span>;
  if (status === "saved") return <span className="text-xs text-emerald-600 font-medium">Saved ✓</span>;
  if (status === "dirty") return <span className="text-xs text-slate-400">Pending save…</span>;
  if (status === "error")
    return (
      <button className="text-xs text-red-600 font-medium underline" onClick={onRetry}>
        Failed — retry
      </button>
    );
  return <span className="text-xs text-slate-300">—</span>;
}