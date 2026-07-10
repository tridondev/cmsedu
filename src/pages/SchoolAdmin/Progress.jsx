import { useEffect, useState } from "react";
import { collection, doc, getDocs, onSnapshot, orderBy, query, where } from "firebase/firestore";
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
 * entry every teacher has completed for a chosen session/term — one ring
 * per class/subject, same completion logic the teacher's own "My classes"
 * progress ring uses, so the two always agree.
 *
 * Session/term default to whatever is currently set on the Settings tab,
 * but can be switched independently here to review a past session/term —
 * every academic session started from Settings shows up as an option so
 * progress stays trackable across the school's whole history.
 */
export default function Progress({ schoolId }) {
  const [school, setSchool] = useState(null);
  const [pastSessions, setPastSessions] = useState([]); // [{id, label}]
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [session, setSession] = useState(null);
  const [term, setTerm] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  // Live: school doc, so the default session/term always tracks what's set
  // on the Settings tab. Only used to seed the pickers the first time —
  // once the admin picks a session/term here, that choice is left alone.
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "schools", schoolId), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      setSchool(data);
      setSession((prev) => prev ?? data.currentSession ?? "");
      setTerm((prev) => prev ?? data.currentTerm ?? "First");
    });
    return unsub;
  }, [schoolId]);

  // Live: every past session archived when Settings > "Start new academic
  // session" was used, so they're selectable here too.
  useEffect(() => {
    const q = query(collection(db, "schools", schoolId, "sessions"), orderBy("label"));
    return onSnapshot(q, (snap) => setPastSessions(snap.docs.map((d) => ({ id: d.id, label: d.data().label }))));
  }, [schoolId]);

  useEffect(() => {
    const q = query(collection(db, "schools", schoolId, "classes"), orderBy("name"));
    return onSnapshot(q, (snap) => setClasses(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
  }, [schoolId]);

  useEffect(() => {
    const q = query(collection(db, "schools", schoolId, "users"), where("role", "==", "teacher"));
    return onSnapshot(q, (snap) => setTeachers(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
  }, [schoolId]);

  const sessionOptions = (() => {
    const set = new Set(pastSessions.map((s) => s.label));
    if (school?.currentSession) set.add(school.currentSession);
    if (session) set.add(session);
    return [...set].filter(Boolean);
  })();

  useEffect(() => {
    if (session === null || term === null || classes.length === 0) return;
    (async () => {
      setLoading(true);
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
            const done = perSubject[subj.id] || 0;
            nextRows.push({
              key: `${c.id}:${subj.id}`,
              className: c.name,
              subjectName: subj.name,
              teacherName: teacher?.name || "Unassigned",
              done,
              total: totalStudents,
              pct: totalStudents ? (done / totalStudents) * 100 : 0,
            });
          });
        })
      );
      // Fully-filled subjects rank top, then most-complete to least; ties
      // broken alphabetically so the order stays stable and scannable.
      nextRows.sort(
        (a, b) => b.pct - a.pct || a.className.localeCompare(b.className) || a.subjectName.localeCompare(b.subjectName)
      );
      setRows(nextRows);
      setLoading(false);
    })();
  }, [schoolId, session, term, classes, teachers]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="page-title">Score entry progress</h2>
        <p className="page-subtitle">
          See how much of each class/subject's scores teachers have entered. Defaults to the session/term set on the
          Settings tab — fully entered subjects are listed first.
        </p>
      </div>

      <div className="card-pad flex flex-col sm:flex-row gap-3 max-w-2xl">
        <div className="flex-1">
          <label className="field-label">Session</label>
          <select className="input" value={session ?? ""} onChange={(e) => setSession(e.target.value)}>
            {sessionOptions.map((s) => (
              <option key={s} value={s}>
                {s}
                {s === school?.currentSession ? " (current)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="field-label">Term</label>
          <select className="input" value={term ?? "First"} onChange={(e) => setTerm(e.target.value)}>
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
                {rows.map((row) => (
                  <tr key={row.key}>
                    <td className="font-medium text-slate-800">{row.className}</td>
                    <td>
                      {row.subjectName}
                      {row.pct === 100 && row.total > 0 && <span className="badge-green ml-2">Complete</span>}
                    </td>
                    <td className="text-slate-500">{row.teacherName}</td>
                    <td className="text-center">
                      {row.done}/{row.total}
                    </td>
                    <td className="text-center">
                      <CircularProgress percent={row.pct} size={36} label={`${Math.round(row.pct)}% complete`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden flex flex-col gap-3">
            {rows.map((row) => (
              <div key={row.key} className="row-card flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                    {row.className}
                    {row.pct === 100 && row.total > 0 && <span className="badge-green">Complete</span>}
                  </p>
                  <p className="text-slate-500 text-xs mt-0.5">{row.subjectName}</p>
                  <p className="text-slate-400 text-[11px] mt-1">
                    {row.teacherName} · {row.done}/{row.total}
                  </p>
                </div>
                <CircularProgress percent={row.pct} label={`${Math.round(row.pct)}% complete`} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
