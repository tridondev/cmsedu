import { Routes, Route, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase/config";
import { useAuth } from "../../context/AuthContext";
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

  if (loading) return <p className="text-slate-400">Loading…</p>;

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Your classes</h2>
      {assignments.length === 0 && <p className="text-slate-400 text-sm">No subjects assigned yet — ask your school admin.</p>}
      <div className="flex flex-col gap-2 max-w-md">
        {assignments.map((a) => {
          const cls = classNames[a.classId];
          const subject = cls?.subjects?.find((s) => s.id === a.subjectId);
          return (
            <Link
              key={`${a.classId}:${a.subjectId}`}
              to={`entry/${a.classId}/${a.subjectId}`}
              className="border rounded p-3 hover:bg-slate-50 text-sm"
            >
              <span className="font-medium">{cls?.name || a.classId}</span>{" "}
              <span className="text-slate-500">— {subject?.name || a.subjectId}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default function TeacherApp({ schoolId }) {
  return (
    <div className="p-6">
      <Routes>
        <Route index element={<TeacherHome schoolId={schoolId} />} />
        <Route path="entry/:classId/:subjectId" element={<ScoreEntryGrid schoolId={schoolId} />} />
      </Routes>
    </div>
  );
}
