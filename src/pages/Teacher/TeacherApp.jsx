import { Routes, Route, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase/config";
import { useAuth } from "../../context/AuthContext";
import AppShell from "../../components/AppShell";
import ScoreEntryGrid from "./ScoreEntryGrid";

function TeacherHome({ schoolId }) {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState([]);
  const [classNames, setClassNames] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const userDoc = await getDoc(doc(db, "schools", schoolId, "users", user.uid));
      const list = userDoc.exists() ? userDoc.data().assignedSubjects || [] : [];
      setAssignments(list);

      const names = {};
      await Promise.all(
        [...new Set(list.map((a) => a.classId))].map(async (classId) => {
          const classDoc = await getDoc(doc(db, "schools", schoolId, "classes", classId));
          if (classDoc.exists()) names[classId] = classDoc.data();
        })
      );
      setClassNames(names);
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
      <p className="page-subtitle mb-6">Tap a class/subject to enter scores.</p>
      {assignments.length === 0 && (
        <div className="card-pad text-center text-slate-400 text-sm">No subjects assigned yet — ask your school admin.</div>
      )}
      <div className="grid sm:grid-cols-2 gap-3">
        {assignments.map((a) => {
          const cls = classNames[a.classId];
          const subject = cls?.subjects?.find((s) => s.id === a.subjectId);
          return (
            <Link
              key={`${a.classId}:${a.subjectId}`}
              to={`entry/${a.classId}/${a.subjectId}`}
              className="card-pad hover:shadow-lifted hover:-translate-y-0.5 transition flex items-center justify-between"
            >
              <div>
                <p className="font-semibold text-slate-900 text-sm">{cls?.name || a.classId}</p>
                <p className="text-slate-500 text-xs mt-0.5">{subject?.name || a.subjectId}</p>
              </div>
              <span className="text-brand-600 text-lg">→</span>
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
