import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { collection, doc, getDocs, setDoc } from "firebase/firestore";
import { db } from "../../firebase/config";
import { computeSubjectTotal, gradeFor, computeClassPositions } from "../../lib/resultEngine";

/**
 * Spark-plan note: normally `recomputeClassPositions` (a Cloud Function)
 * recalculates positions server-side on every score write. Cloud Functions
 * require the Blaze plan, so until that's enabled this runs the identical
 * pure function (`computeClassPositions`, same file used by the function)
 * client-side right after a save. Swap this call out once Functions are
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
  const gradingScale = classId?.startsWith("SS") ? "SS" : "JSS";

  useEffect(() => {
    getDocs(collection(db, "schools", schoolId, "classes", classId, "students")).then((snap) => {
      setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [schoolId, classId]);

  const updateField = (studentId, field, value) => {
    setScores((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], [field]: Number(value) },
    }));
  };

  const saveRow = async (studentId) => {
    const raw = scores[studentId] || {};
    const total = computeSubjectTotal(raw, gradingScale);
    const { grade } = gradeFor(total, gradingScale);
    const resultKey = `current_${classId}`;
    await setDoc(
      doc(db, "schools", schoolId, "results", resultKey, "scores", `${studentId}_${subjectId}`),
      { ...raw, total, grade, updatedAt: Date.now() }
    );
    await recomputePositionsClientSide(schoolId, resultKey);
  };

  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="border-b">
          <th className="text-left p-2">Student</th>
          <th>CA1</th><th>CA2</th><th>Test1</th><th>Test2</th><th>Exam</th><th>Total</th><th></th>
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
              <td><button className="text-blue-600" onClick={() => saveRow(s.id)}>Save</button></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
