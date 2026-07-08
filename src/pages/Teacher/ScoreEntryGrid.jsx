import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { db } from "../../firebase/config";
import { computeSubjectTotal, gradeFor, computeClassPositions } from "../../lib/resultEngine";

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

export default function ScoreEntryGrid({ schoolId }) {
  const { classId, subjectId } = useParams();
  const [students, setStudents] = useState([]);
  const [scores, setScores] = useState({});
  const [classInfo, setClassInfo] = useState(null);
  const [term, setTerm] = useState(null);
  const [savedRows, setSavedRows] = useState({}); // studentId -> true once saved this session
  const [loading, setLoading] = useState(true);

  const gradingScale = classInfo?.level?.startsWith("SS") ? "SS" : "JSS";
  const subject = classInfo?.subjects?.find((s) => s.id === subjectId);
  const resultKey = term && classId ? `${term}_${classId}` : null;

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [schoolSnap, classSnap, studentsSnap] = await Promise.all([
        getDoc(doc(db, "schools", schoolId)),
        getDoc(doc(db, "schools", schoolId, "classes", classId)),
        getDocs(collection(db, "schools", schoolId, "classes", classId, "students")),
      ]);
      const currentTerm = schoolSnap.exists() ? schoolSnap.data().currentTerm || "First" : "First";
      setTerm(currentTerm);
      setClassInfo(classSnap.exists() ? classSnap.data() : null);
      const studentList = studentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setStudents(studentList);

      // Preload any scores already entered this term for this subject.
      const key = `${currentTerm}_${classId}`;
      const existing = {};
      await Promise.all(
        studentList.map(async (s) => {
          const scoreDoc = await getDoc(doc(db, "schools", schoolId, "results", key, "scores", `${s.id}_${subjectId}`));
          if (scoreDoc.exists()) {
            existing[s.id] = scoreDoc.data();
            setSavedRows((prev) => ({ ...prev, [s.id]: true }));
          }
        })
      );
      setScores(existing);
      setLoading(false);
    })();
  }, [schoolId, classId, subjectId]);

  const updateField = (studentId, field, value) => {
    setScores((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], [field]: Number(value) },
    }));
    setSavedRows((prev) => ({ ...prev, [studentId]: false }));
  };

  const saveRow = async (studentId) => {
    const raw = scores[studentId] || {};
    const total = computeSubjectTotal(raw, gradingScale);
    const { grade } = gradeFor(total, gradingScale);
    await setDoc(doc(db, "schools", schoolId, "results", resultKey, "scores", `${studentId}_${subjectId}`), {
      ...raw,
      total,
      grade,
      updatedAt: Date.now(),
    });
    await recomputePositionsClientSide(schoolId, resultKey);
    setSavedRows((prev) => ({ ...prev, [studentId]: true }));
  };

  if (loading) return <p className="text-slate-400">Loading…</p>;
  if (!classInfo) return <p className="text-red-600">Class not found.</p>;

  return (
    <div>
      <h3 className="text-lg font-semibold mb-1">
        {classInfo.name} — {subject?.name || subjectId}
      </h3>
      <p className="text-sm text-slate-500 mb-4">{term} Term</p>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b">
            <th className="text-left p-2">Student</th>
            <th>CA1</th>
            <th>CA2</th>
            <th>Test1</th>
            <th>Test2</th>
            <th>Exam</th>
            <th>Total</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {students.map((s) => {
            const row = scores[s.id] || {};
            const total = computeSubjectTotal(row, gradingScale);
            return (
              <tr key={s.id} className="border-b">
                <td className="p-2">{s.fullName}</td>
                {["ca1", "ca2", "test1", "test2", "exam"].map((f) => (
                  <td key={f}>
                    <input
                      type="number"
                      className="w-14 border rounded p-1"
                      value={row[f] ?? ""}
                      onChange={(e) => updateField(s.id, f, e.target.value)}
                    />
                  </td>
                ))}
                <td className="text-center font-medium">{total}</td>
                <td>
                  <button className="text-blue-600" onClick={() => saveRow(s.id)}>
                    {savedRows[s.id] ? "Saved ✓" : "Save"}
                  </button>
                </td>
              </tr>
            );
          })}
          {students.length === 0 && (
            <tr>
              <td colSpan={8} className="p-4 text-slate-400">
                No students in this class yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
