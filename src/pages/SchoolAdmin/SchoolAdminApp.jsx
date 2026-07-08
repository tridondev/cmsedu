import { Routes, Route, NavLink } from "react-router-dom";
import Classes from "./Classes";
import Students from "./Students";
import Teachers from "./Teachers";
import Results from "./Results";
import Settings from "./Settings";

const TABS = [
  { to: "", label: "Overview", end: true },
  { to: "classes", label: "Classes" },
  { to: "students", label: "Students" },
  { to: "teachers", label: "Teachers" },
  { to: "results", label: "Results & Export" },
  { to: "settings", label: "Signatures/Settings" },
];

export default function SchoolAdminApp({ schoolId }) {
  return (
    <div className="p-6">
      <nav className="flex gap-4 mb-6 text-sm">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) => (isActive ? "font-semibold text-slate-900" : "text-slate-500")}
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <Routes>
        <Route index element={<Overview schoolId={schoolId} />} />
        <Route path="classes" element={<Classes schoolId={schoolId} />} />
        <Route path="students" element={<Students schoolId={schoolId} />} />
        <Route path="teachers" element={<Teachers schoolId={schoolId} />} />
        <Route path="results" element={<Results schoolId={schoolId} />} />
        <Route path="settings" element={<Settings schoolId={schoolId} />} />
      </Routes>
    </div>
  );
}

function Overview() {
  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-semibold mb-2">Welcome</h2>
      <p className="text-slate-500 text-sm">
        Start in <b>Classes</b> to set up your class list and subjects, then <b>Students</b> to add your
        roster, then <b>Teachers</b> to invite staff and assign them to subjects. Once scores are entered,
        use <b>Results & Export</b> to review positions and download the report card workbook.
      </p>
    </div>
  );
}
