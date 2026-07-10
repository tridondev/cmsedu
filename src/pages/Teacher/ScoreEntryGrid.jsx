import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { collection, doc, getDoc, getDocs, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../../firebase/config";
import { computeSubjectTotal, gradeFor, computeClassPositions, gradingScaleFor, effectiveWeights } from "../../lib/resultEngine";

/** Must match resultKeyFor() in SchoolAdmin/Results.jsx — keeps each academic session's scores separate. */
function resultKeyFor(session, term, classId) {
  const s = (session || "session").replace(/[^a-zA-Z0-9]+/g, "-");
  return `${s}_${term}_${classId}`;
}

/**
 * Spark-plan note: normally `recomputeClassPositions` (a Cloud Function)
 * recalculates positions server-side on every score write. Cloud Functions
 * require the Blaze plan, so until that's enabled this runs the identical
 * pure function (`computeClassPositions`, same one a deployed function would
 * use) client-side right after a save. Swap this call out once Functions are
 * deployed — nothing else in the app needs to change, since both read/write
 * the same results/{key}/meta/positions doc shape.
 */
async function recomputePositionsClientSide(schoolId, resultKey) {
  const scoresSnap = await getDocs(collection(db, "schools", schoolId, "results", resultKey, "scores"));
  const studentsScores = {};
  const subjectIds = new Set();

  scoresSnap.forEach((d) => {
    const [studentId, subjectId] = d.id.split("_");
    studentsScores[studentId] = studentsScores[studentId] || {};
    studentsScores[studentId][subjectId] = d.data().total || 0;
    subjectIds.add(subjectId);
  });

  const positions = computeClassPositions(studentsScores, [...subjectIds]);
  await setDoc(
    doc(db, "schools", schoolId, "results", resultKey, "meta", "positions"),
    { positions, computedAt: Date.now() },
    { merge: true }
  );
}

const FIELDS = [
  { key: "ca1", label: "CA1" },
  { key: "ca2", label: "CA2" },
  { key: "test1", label: "Test 1" },
  { key: "test2", label: "Test 2" },
  { key: "exam", label: "Exam" },
];

export default function ScoreEntryGrid({ schoolId }) {
  const { classId, subjectId } = useParams();
  const [students, setStudents] = useState([]);
  const [scores, setScores] = useState({});
  const [classInfo, setClassInfo] = useState(null);
  const [term, setTerm] = useState(null);
  const [session, setSession] = useState(null);
  const [weights, setWeights] = useState(null);
  const [savedRows, setSavedRows] = useState({}); // studentId -> true once saved this session
  const [loading, setLoading] = useState(true);

  const gradingScale = gradingScaleFor(classInfo?.level);
  const subject = classInfo?.subjects?.find((s) => s.id === subjectId);
  const resultKey = term && classId ? resultKeyFor(session, term, classId) : null;

  const [schoolData, setSchoolData] = useState(null);
  const [classLoaded, setClassLoaded] = useState(false);
  const [studentsLoaded, setStudentsLoaded] = useState(false);

  // Live: current term/session/grading weights — reflects admin changes
  // (e.g. switching term, editing weights) without a page refresh.
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "schools", schoolId), (snap) => {
      const data = snap.exists() ? snap.data() : {};
      setSchoolData(data);
      setTerm(data.currentTerm || "First");
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
    setStudentsLoaded(false);
    const unsub = onSnapshot(collection(db, "schools", schoolId, "classes", classId, "students"), (snap) => {
      setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setStudentsLoaded(true);
    });
    return unsub;
  }, [schoolId, classId]);

  useEffect(() => {
    if (classInfo !== null) setWeights(effectiveWeights(gradingScaleFor(classInfo?.level), schoolData?.weights));
  }, [classInfo, schoolData]);

  // Preload any scores already entered this term for this subject. Re-runs
  // whenever the roster or the active term/session changes.
  useEffect(() => {
    if (!classLoaded || !studentsLoaded || !resultKey) return;
    (async () => {
      const existing = {};
      const nextSaved = {};
      await Promise.all(
        students.map(async (s) => {
          const scoreDoc = await getDoc(doc(db, "schools", schoolId, "results", resultKey, "scores", `${s.id}_${subjectId}`));
          if (scoreDoc.exists()) {
            existing[s.id] = scoreDoc.data();
            nextSaved[s.id] = true;
          }
        })
      );
      setScores(existing);
      setSavedRows(nextSaved);
      setLoading(false);
    })();
  }, [schoolId, classLoaded, studentsLoaded, students, subjectId, resultKey]);

  const updateField = (studentId, field, value) => {
    setScores((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], [field]: Number(value) },
    }));
    setSavedRows((prev) => ({ ...prev, [studentId]: false }));
  };

  const saveRow = async (studentId) => {
    const raw = scores[studentId] || {};
    const total = computeSubjectTotal(raw, gradingScale, undefined, weights);
    const { grade, remark } = gradeFor(total, gradingScale);
    await setDoc(doc(db, "schools", schoolId, "results", resultKey, "scores", `${studentId}_${subjectId}`), {
      ...raw,
      total,
      grade,
      remark,
      updatedAt: Date.now(),
    });
    await recomputePositionsClientSide(schoolId, resultKey);
    setSavedRows((prev) => ({ ...prev, [studentId]: true }));
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
      <Link to=".." className="text-sm text-brand-600 font-medium mb-3 inline-flex items-center gap-1">
        ← Back to my classes
      </Link>
      <h2 className="page-title">
        {classInfo.name} — {subject?.name || subjectId}
      </h2>
      <p className="page-subtitle mb-6">{term} Term score entry</p>

      {/* Desktop / tablet: table */}
      <div className="hidden sm:block table-wrap">
        <table className="table-modern">
          <thead>
            <tr>
              <th>Student</th>
              {FIELDS.map((f) => (
                <th key={f.key} className="text-center">
                  {f.label}
                </th>
              ))}
              <th className="text-center">Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => {
              const row = scores[s.id] || {};
              const total = computeSubjectTotal(row, gradingScale, undefined, weights);
              return (
                <tr key={s.id}>
                  <td className="font-medium text-slate-800">{s.fullName}</td>
                  {FIELDS.map((f) => (
                    <td key={f.key} className="text-center">
                      <input
                        type="number"
                        className="input w-16 py-1.5 text-center mx-auto"
                        value={row[f.key] ?? ""}
                        onChange={(e) => updateField(s.id, f.key, e.target.value)}
                      />
                    </td>
                  ))}
                  <td className="text-center font-semibold text-slate-900">{total}</td>
                  <td className="text-center">
                    <button className="btn-sm btn-secondary" onClick={() => saveRow(s.id)}>
                      {savedRows[s.id] ? "Saved ✓" : "Save"}
                    </button>
                  </td>
                </tr>
              );
            })}
            {students.length === 0 && (
              <tr>
                <td colSpan={FIELDS.length + 3} className="p-6 text-center text-slate-400">
                  No students in this class yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile: stacked cards */}
      <div className="sm:hidden flex flex-col gap-3">
        {students.map((s) => {
          const row = scores[s.id] || {};
          const total = computeSubjectTotal(row, gradingScale, undefined, weights);
          return (
            <div key={s.id} className="row-card">
              <div className="flex items-center justify-between mb-1">
                <p className="font-semibold text-slate-900 text-sm">{s.fullName}</p>
                <span className="badge-brand">{total} pts</span>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {FIELDS.map((f) => (
                  <div key={f.key}>
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{f.label}</label>
                    <input
                      type="number"
                      className="input py-1.5 text-center mt-0.5"
                      value={row[f.key] ?? ""}
                      onChange={(e) => updateField(s.id, f.key, e.target.value)}
                    />
                  </div>
                ))}
              </div>
              <button className="btn-secondary btn-sm mt-3 w-full" onClick={() => saveRow(s.id)}>
                {savedRows[s.id] ? "Saved ✓" : "Save score"}
              </button>
            </div>
          );
        })}
        {students.length === 0 && <div className="card-pad text-center text-slate-400 text-sm">No students in this class yet.</div>}
      </div>
    </div>
  );
}