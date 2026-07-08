import { Link } from "react-router-dom";

export default function Landing() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <h1 className="text-3xl font-bold">CMSEDU</h1>
      <p className="text-slate-500">Result management for schools.</p>
      <Link to="/educms/admin" className="text-blue-600 underline">Super Admin login</Link>
      <p className="text-sm text-slate-400">Schools sign in at /educms/&lt;your-school-slug&gt;</p>
    </div>
  );
}
