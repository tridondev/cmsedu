import { Routes, Route, Link } from "react-router-dom";

export default function SchoolAdminApp({ schoolId }) {
  return (
    <div className="p-6">
      <nav className="flex gap-4 mb-6 text-sm">
        <Link to="">Overview</Link>
        <Link to="classes">Classes</Link>
        <Link to="students">Students</Link>
        <Link to="teachers">Teachers</Link>
        <Link to="results">Results & Export</Link>
        <Link to="settings">Signatures/Settings</Link>
      </nav>
      <Routes>
        <Route index element={<p>Admin overview for school {schoolId}</p>} />
        {/* Classes, Students, Teachers, Results, Settings screens plug in here,
            each reading/writing schools/{schoolId}/... per the data model in README.md */}
      </Routes>
    </div>
  );
}
