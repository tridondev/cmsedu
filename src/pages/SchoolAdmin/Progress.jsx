import { useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "../../firebase/config";
import CircularProgress from "../../components/CircularProgress";

/** Must match resultKeyFor() in Results.jsx / ScoreEntryGrid.jsx / TeacherApp.jsx. */
function resultKeyFor(session, term, classId) {
  const s = (session || "session").replace(/[^a-zA-Z0-9]+/g, "-");
  return `${s}_${term}_${classId}`;
}

const TERMS = ["First", "Second", "Third"];

/**
 * Lets a school admin see, at a glance, how much of each class's score
 * entry every teacher has completed for the current (or a chosen) term —
 * one ring per class/subject, same completion logic the teacher's own "My
 * classes" progress ring uses, so the two always agree.
 */
export default function Progress({ schoolId }) {
  const [school, setSchool] = useState(null);
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [term, setTerm] = useState("First");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDoc(doc(db, "schools", schoolId)).then((snap) => {
      if (snap.exists()) {
        setSchool(snap.data());
        if (snap.data().currentTerm) setTerm(snap.data().currentTerm);
      }
    });
  }, [schoolId]);

  useEffect(() => {
    const q = query(collection(db, "schools", schoolId, "classes"), orderBy("name"));
    return onSnapshot(q, (snap) => setClasses(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
  }, [schoolId]);

  useEffect(() => {
    const q = query(collection(db, "schools", schoolId, "users"), where("role", "==", "teacher"));
    return onSnapshot(q, (snap) => setTeachers(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
  }, [schoolId]);

  useEffect(() => {
    if (!school || classes.length === 0) return;
    (async () => {
      setLoading(true);
      const session = school.currentSession || "";
      const nextRows = [];
      await Promise.all(
        classes.map(async (c) => {
          const [studentsSnap, scoresSnap] = await Promise.all([
            getDocs(collection(db, "schools", schoolId, "classes", c.id, "students")),
            getDocs(collection(db, "schools", schoolId, "results", resultKeyFor(session, term, c.id), "scores")),
          ]);
          const totalStudents = studentsSnap.size;
          const perSubject = {};
          scoresSnap.forEach((d) => {
            const subjectId = d.id.split("_")[1];
            perSubject[subjectId] = (perSubject[subjectId] || 0) + 1;
          });
          (c.subjects || []).forEach((subj) => {
            const teacher = teachers.find((t) =>
              (t.assignedSubjects || []).some((a) => a.classId === c.id && a.subjectId === subj.id)
            );
            nextRows.push({
              key: `${c.id}:${subj.id}`,
              className: c.name,
              subjectName: subj.name,
              teacherName: teacher?.name || "Unassigned",
              done: perSubject[subj.id] || 0,
              total: totalStudents,
            });
          });
        })
      );
      nextRows.sort((a, b) => a.className.localeCompare(b.className) || a.subjectName.localeCompare(b.subjectName));
      setRows(nextRows);
      setLoading(false);
    })();
  }, [schoolId, school, classes, teachers, term]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="page-title">Score entry progress</h2>
        <p className="page-subtitle">See how much of each class/subject's scores teachers have entered this term.</p>
      </div>

      <div className="card-pad flex flex-col sm:flex-row sm:items-end gap-3 max-w-md">
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
      </div>

      {loading && (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card-pad h-14 animate-pulse bg-slate-100" />
          ))}
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div className="card-pad text-center text-slate-400 text-sm">No classes with subjects yet.</div>
      )}

      {!loading && rows.length > 0 && (
        <>
          {/* Desktop / tablet table */}
          <div className="hidden sm:block table-wrap">
            <table className="table-modern">
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Subject</th>
                  <th>Teacher</th>
                  <th className="text-center">Entered</th>
                  <th className="text-center">Progress</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const pct = row.total ? (row.done / row.total) * 100 : 0;
                  return (
                    <tr key={row.key}>
                      <td className="font-medium text-slate-800">{row.className}</td>
                      <td>{row.subjectName}</td>
                      <td className="text-slate-500">{row.teacherName}</td>
                      <td className="text-center">
                        {row.done}/{row.total}
                      </td>
                      <td className="text-center">
                        <CircularProgress percent={pct} size={36} label={`${Math.round(pct)}% complete`} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden flex flex-col gap-3">
            {rows.map((row) => {
              const pct = row.total ? (row.done / row.total) * 100 : 0;
              return (
                <div key={row.key} className="row-card flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900 text-sm">{row.className}</p>
                    <p className="text-slate-500 text-xs mt-0.5">{row.subjectName}</p>
                    <p className="text-slate-400 text-[11px] mt-1">
                      {row.teacherName} · {row.done}/{row.total}
                    </p>
                  </div>
                  <CircularProgress percent={pct} label={`${Math.round(pct)}% complete`} />
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
