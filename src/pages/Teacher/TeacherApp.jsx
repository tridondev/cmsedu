import { Routes, Route } from "react-router-dom";
import ScoreEntryGrid from "./ScoreEntryGrid";

export default function TeacherApp({ schoolId }) {
  return (
    <div className="p-6">
      <Routes>
        <Route index element={<p>Select a class & subject to enter scores.</p>} />
        <Route path="entry/:classId/:subjectId" element={<ScoreEntryGrid schoolId={schoolId} />} />
      </Routes>
    </div>
  );
}
