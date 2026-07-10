import { Routes, Route } from "react-router-dom";
import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase/config";
import { useAuth } from "../../context/AuthContext";
import AppShell from "../../components/AppShell";
import Classes from "./Classes";
import Students from "./Students";
import Teachers from "./Teachers";
import Results from "./Results";
import Progress from "./Progress";
import Promotion from "./Promotion";
import Settings from "./Settings";

const TABS = [
  { to: "", label: "Overview", end: true },
  { to: "classes", label: "Classes" },
  { to: "students", label: "Students" },
  { to: "teachers", label: "Teachers" },
  { to: "progress", label: "Progress" },
  { to: "results", label: "Results & Export" },
  { to: "promotion", label: "New Session" },
  { to: "settings", label: "Signatures/Settings" },
];

export default function SchoolAdminApp({ schoolId }) {
  const { logout } = useAuth();
  const [schoolName, setSchoolName] = useState("");

  useEffect(() => {
    getDoc(doc(db, "schools", schoolId)).then((snap) => {
      if (snap.exists()) setSchoolName(snap.data().name || "");
    });
  }, [schoolId]);

  return (
    <AppShell eyebrow="School Admin" title={schoolName || "Loading…"} subtitle="CMSEDU" navItems={TABS} onLogout={logout}>
      <Routes>
        <Route index element={<Overview schoolId={schoolId} />} />
        <Route path="classes" element={<Classes schoolId={schoolId} />} />
        <Route path="students" element={<Students schoolId={schoolId} />} />
        <Route path="teachers" element={<Teachers schoolId={schoolId} />} />
        <Route path="progress" element={<Progress schoolId={schoolId} />} />
        <Route path="results" element={<Results schoolId={schoolId} />} />
        <Route path="promotion" element={<Promotion schoolId={schoolId} />} />
        <Route path="settings" element={<Settings schoolId={schoolId} />} />
      </Routes>
    </AppShell>
  );
}

function Overview() {
  const steps = [
    { title: "Classes", body: "Set up your class list and subjects." },
    { title: "Students", body: "Add your student roster to each class." },
    { title: "Teachers", body: "Invite staff and assign them to subjects." },
    { title: "Results & Export", body: "Review positions and download report cards." },
  ];
  return (
    <div className="max-w-2xl">
      <h2 className="page-title">Welcome 👋</h2>
      <p className="page-subtitle mb-6">Here's the recommended order to get your school set up.</p>
      <div className="flex flex-col gap-3">
        {steps.map((s, i) => (
          <div key={s.title} className="card-pad flex items-start gap-4">
            <span className="h-8 w-8 shrink-0 rounded-full bg-brand-50 text-brand-700 font-bold flex items-center justify-center text-sm">
              {i + 1}
            </span>
            <div>
              <p className="font-semibold text-slate-900 text-sm">{s.title}</p>
              <p className="text-sm text-slate-500 mt-0.5">{s.body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
