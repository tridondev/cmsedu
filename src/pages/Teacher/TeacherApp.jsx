import { Routes, Route, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "../../firebase/config";
import { useAuth } from "../../context/AuthContext";
import AppShell from "../../components/AppShell";
import CircularProgress from "../../components/CircularProgress";
import ScoreEntryGrid from "./ScoreEntryGrid";

/** Must match resultKeyFor() in SchoolAdmin/Results.jsx and Teacher/ScoreEntryGrid.jsx. */
function resultKeyFor(session, term, classId) {
  const s = (session || "session").replace(/[^a-zA-Z0-9]+/g, "-");
  return `${s}_${term}_${classId}`;
}

function TeacherHome({ schoolId }) {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState([]);
  const [classNames, setClassNames] = useState({});
  const [progress, setProgress] = useState({}); // "classId:subjectId" -> { done, total }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [userDoc, schoolDoc] = await Promise.all([
        getDoc(doc(db, "schools", schoolId, "users", user.uid)),
        getDoc(doc(db, "schools", schoolId)),
      ]);
      const list = userDoc.exists() ? userDoc.data().assignedSubjects || [] : [];
      setAssignments(list);

      const school = schoolDoc.exists() ? schoolDoc.data() : {};
      const term = school.currentTerm || "First";
      const session = school.currentSession || "";

      const names = {};
      const studentCounts = {};
      await Promise.all(
        [...new Set(list.map((a) => a.classId))].map(async (classId) => {
          const [classDoc, studentsSnap] = await Promise.all([
            getDoc(doc(db, "schools", schoolId, "classes", classId)),
            getDocs(collection(db, "schools", schoolId, "classes", classId, "students")),
          ]);
          if (classDoc.exists()) names[classId] = classDoc.data();
          studentCounts[classId] = studentsSnap.size;
        })
      );
      setClassNames(names);

      // For each class this teacher touches, pull all saved score docs once
      // and tally how many belong to each subject — that count vs. the
      // class roster size is the "entry complete" percentage per assignment.
      const nextProgress = {};
      await Promise.all(
        [...new Set(list.map((a) => a.classId))].map(async (classId) => {
          const resultKey = resultKeyFor(session, term, classId);
          const scoresSnap = await getDocs(collection(db, "schools", schoolId, "results", resultKey, "scores"));
          const perSubject = {};
          scoresSnap.forEach((d) => {
            const subjectId = d.id.split("_")[1];
            perSubject[subjectId] = (perSubject[subjectId] || 0) + 1;
          });
          list
            .filter((a) => a.classId === classId)
            .forEach((a) => {
              nextProgress[`${a.classId}:${a.subjectId}`] = {
                done: perSubject[a.subjectId] || 0,
                total: studentCounts[classId] || 0,
              };
            });
        })
      );
      setProgress(nextProgress);
      setLoading(false);
    })();
  }, [schoolId, user]);

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card-pad h-16 animate-pulse bg-slate-100" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <h2 className="page-title">Your classes</h2>
      <p className="page-subtitle mb-6">Tap a class/subject to enter scores. The ring shows how much of the roster you've completed.</p>
      {assignments.length === 0 && (
        <div className="card-pad text-center text-slate-400 text-sm">No subjects assigned yet — ask your school admin.</div>
      )}
      <div className="grid sm:grid-cols-2 gap-3">
        {assignments.map((a) => {
          const cls = classNames[a.classId];
          const subject = cls?.subjects?.find((s) => s.id === a.subjectId);
          const p = progress[`${a.classId}:${a.subjectId}`] || { done: 0, total: 0 };
          const pct = p.total ? (p.done / p.total) * 100 : 0;
          return (
            <Link
              key={`${a.classId}:${a.subjectId}`}
              to={`entry/${a.classId}/${a.subjectId}`}
              className="card-pad hover:shadow-lifted hover:-translate-y-0.5 transition flex items-center justify-between gap-3"
            >
              <div>
                <p className="font-semibold text-slate-900 text-sm">{cls?.name || a.classId}</p>
                <p className="text-slate-500 text-xs mt-0.5">{subject?.name || a.subjectId}</p>
                <p className="text-slate-400 text-[11px] mt-1">
                  {p.done}/{p.total} students entered
                </p>
              </div>
              <CircularProgress percent={pct} label={`${Math.round(pct)}% complete`} />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

const TABS = [{ to: "", label: "My classes", end: true }];

export default function TeacherApp({ schoolId }) {
  const { logout } = useAuth();
  return (
    <AppShell eyebrow="Teacher" title="Score Entry" subtitle="CMSEDU" navItems={TABS} onLogout={logout}>
      <Routes>
        <Route index element={<TeacherHome schoolId={schoolId} />} />
        <Route path="entry/:classId/:subjectId" element={<ScoreEntryGrid schoolId={schoolId} />} />
      </Routes>
    </AppShell>
  );
}
