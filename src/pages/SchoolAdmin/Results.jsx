import { useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, setDoc } from "firebase/firestore";
import { db } from "../../firebase/config";
import { computeClassPositions, computeCumulativeTerm } from "../../lib/resultEngine";
import { exportClassResults, downloadWorkbook } from "../../lib/exportToExcel";

const TERMS = ["First", "Second", "Third"];

async function fetchTermScores(schoolId, classId, term) {
  const resultKey = `${term}_${classId}`;
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

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
    if (!classId || !term) return;
    const resultKey = `${term}_${classId}`;
    (async () => {
      setScoresByStudent(await fetchTermScores(schoolId, classId, term));
      const metaSnap = await getDoc(doc(db, "schools", schoolId, "results", resultKey, "meta", "positions"));
      setPositions(metaSnap.exists() ? metaSnap.data().positions || {} : {});
    })();
  }, [schoolId, classId, term]);

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
        doc(db, "schools", schoolId, "results", `${term}_${classId}`, "meta", "positions"),
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

  const buildStudentExportData = (studentId) => {
    const s = students.find((st) => st.id === studentId);
    const pos = positions[studentId] || {};
    const scores = {};
    subjects.forEach((subj) => {
      const raw = scoresByStudent[studentId]?.[subj.id] || {};
      scores[subj.id] = {
        ...raw,
        classAvg: "", // wired up once class-average calc is added to resultEngine
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
    };
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
        termEndingDate: "",
        nextTermBegins: "",
        subjects,
      };

      let cumulative;
      let exportStudents = students.map((s) => buildStudentExportData(s.id));

      if (isThirdTerm) {
        const firstScores = await fetchTermScores(schoolId, classId, "First");
        const secondScores = await fetchTermScores(schoolId, classId, "Second");
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
        { name: school?.name, address: school?.address, ministry: school?.ministry },
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
    <div className="flex flex-col gap-6 max-w-4xl">
      <div className="flex gap-3">
        <select className="border p-2 rounded" value={classId} onChange={(e) => setClassId(e.target.value)}>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select className="border p-2 rounded" value={term} onChange={(e) => setTerm(e.target.value)}>
          {TERMS.map((t) => (
            <option key={t} value={t}>
              {t} Term
            </option>
          ))}
        </select>
        <button className="border px-3 rounded disabled:opacity-50" disabled={busy || !classId} onClick={recompute}>
          Recompute positions
        </button>
        <button className="bg-slate-900 text-white px-4 rounded disabled:opacity-50" disabled={busy || !classId || students.length === 0} onClick={doExport}>
          {busy ? "Working…" : "Export to Excel"}
        </button>
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}
      {!classId && <p className="text-slate-400 text-sm">Create a class first.</p>}

      {classId && (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b text-left">
              <th className="p-2">Student</th>
              {subjects.map((s) => (
                <th key={s.id} className="p-2 text-center">
                  {s.name}
                </th>
              ))}
              <th className="p-2 text-center">Total</th>
              <th className="p-2 text-center">Average</th>
              <th className="p-2 text-center">Position</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => {
              const pos = positions[s.id] || {};
              return (
                <tr key={s.id} className="border-b">
                  <td className="p-2">{s.fullName}</td>
                  {subjects.map((subj) => (
                    <td key={subj.id} className="p-2 text-center">
                      {scoresByStudent[s.id]?.[subj.id]?.total ?? "-"}
                    </td>
                  ))}
                  <td className="p-2 text-center font-medium">{pos.overallTotal ?? "-"}</td>
                  <td className="p-2 text-center">{pos.overallAverage ?? "-"}</td>
                  <td className="p-2 text-center">{pos.overallPosition ?? "-"}</td>
                </tr>
              );
            })}
            {students.length === 0 && (
              <tr>
                <td className="p-4 text-slate-400" colSpan={subjects.length + 4}>
                  No students in this class.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
