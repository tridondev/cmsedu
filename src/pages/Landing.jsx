import { Link } from "react-router-dom";

const FEATURES = [
  {
    title: "Built for Nigerian schools",
    body: "JSS & SS grading scales, behaviour ratings, and termly/annual report cards out of the box.",
  },
  {
    title: "Role-based access",
    body: "Platform admins onboard schools; school admins manage staff and classes; teachers only see what's assigned to them.",
  },
  {
    title: "One-click Excel export",
    body: "Every student's full report card exports to its own print-ready A4 page — no manual formatting.",
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="px-5 sm:px-8 py-5 flex items-center justify-between">
        <div className="inline-flex items-center gap-2 font-display font-extrabold text-slate-900 text-lg">
          <span className="h-8 w-8 rounded-lg bg-brand-600 text-white flex items-center justify-center text-sm">C</span>
          CMSEDU
        </div>
        <Link to="/educms/admin" className="btn-secondary btn-sm hidden sm:inline-flex">
          Super Admin login
        </Link>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-5 py-10 sm:py-16 text-center">
        <span className="badge-brand mb-5">Result Management Platform</span>
        <h1 className="font-display font-extrabold text-slate-900 text-3xl sm:text-5xl leading-tight max-w-2xl">
          Result management for schools, done right.
        </h1>
        <p className="text-slate-500 text-base sm:text-lg mt-4 max-w-xl">
          CMSEDU helps schools manage classes, students, teachers, and termly report cards — with clean,
          print-ready exports every parent can read.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 mt-8 w-full max-w-sm">
          <Link to="/educms/admin" className="btn-primary w-full">
            Super Admin login
          </Link>
        </div>

        <div className="card-pad mt-8 max-w-md w-full text-left">
          <p className="field-label mb-2">Schools sign in at</p>
          <code className="block text-sm bg-slate-100 rounded-lg px-3 py-2 text-slate-700 break-all">
            /educms/&lt;your-school-slug&gt;
          </code>
          <p className="text-xs text-slate-400 mt-2">
            Your school's exact link is issued by your platform admin when your school is onboarded.
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 mt-14 max-w-4xl w-full text-left">
          {FEATURES.map((f) => (
            <div key={f.title} className="card-pad">
              <h3 className="font-semibold text-slate-900 text-sm">{f.title}</h3>
              <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="px-5 py-6 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} CMSEDU. All rights reserved.
      </footer>
    </div>
  );
}
