import { useEffect, useState } from "react";

const WHATSAPP_NUMBER = "2348107344084";
const DISPLAY_PHONE = "+234 810 734 4084";
const WHATSAPP_HREF = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
  "Hi CMSEDU, I'd like to learn more about setting up result management for my school."
)}`;
const TEL_HREF = `tel:+${WHATSAPP_NUMBER}`;

const PAIN_POINTS = [
  "Result compilation eats entire weekends, every single term",
  "One mistyped score in Excel can throw off a whole class average",
  "Teachers format the same report card layout by hand, over and over",
  "No clean record of who entered what, or when",
];

const GAINS = [
  "Scores go in once — grading, averages, and positions calculate themselves",
  "Every report card renders on a print-ready A4 page, automatically",
  "Teachers only touch their own classes; admins see everything",
  "A full, dated record of every entry, for every term",
];

const FEATURES = [
  {
    title: "Built for Nigerian schools",
    body: "JSS & SS grading scales, behaviour ratings, and termly/annual report cards, configured out of the box — not bolted on.",
  },
  {
    title: "Role-based access",
    body: "Platform admins onboard schools; school admins manage staff and classes; teachers only see what's assigned to them.",
  },
  {
    title: "One-click Excel export",
    body: "Every student's full report card exports to its own print-ready A4 page — no manual formatting, ever.",
  },
  {
    title: "Set up with you, not just for you",
    body: "We onboard your school directly and walk your staff through their first term — this isn't a self-serve signup form.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "We onboard your school",
    body: "Send us your school's structure — classes, arms, and subjects — and we set up your dedicated CMSEDU space.",
  },
  {
    n: "02",
    title: "Add your staff and students",
    body: "School admins invite teachers and register students; each teacher only sees their own classes.",
  },
  {
    n: "03",
    title: "Generate report cards each term",
    body: "Teachers enter scores once. Averages, positions, and print-ready report cards are ready in one click.",
  },
];

const SAMPLES = [
  {
    id: "jss-termly",
    label: "JSS · Termly report",
    title: "Junior Secondary termly report card",
    body: "Assignment, test, and exam breakdown with class position and grade, per student.",
    image: "/samples/jss-termly-report.png",
    pdf: "/samples/JSS-Termly-Report-Sample.pdf",
  },
  {
    id: "jss-second-term",
    label: "JSS · Mid-session report",
    title: "Junior Secondary mid-session report card",
    body: "The same JSS layout part-way through a session, before the annual summary fills in.",
    image: "/samples/jss-second-term-report.png",
    pdf: "/samples/JSS-Second-Term-Sample.pdf",
  },
  {
    id: "ss1-first-term",
    label: "SS1 Science · First term",
    title: "Senior Secondary first term report card",
    body: "Weighted 5/5/10/10/70 scoring for SS1 Science, with behaviour ratings and remarks.",
    image: "/samples/ss1-first-term-report.png",
    pdf: "/samples/SS1-First-Term-Sample.pdf",
  },
  {
    id: "ss1-annual",
    label: "SS1 Science · Annual summary",
    title: "Senior Secondary annual summary report card",
    body: "Third term view with cumulative position, annual average, and promotion comment.",
    image: "/samples/ss1-annual-report.png",
    pdf: "/samples/SS1-Annual-Report-Sample.pdf",
  },
];

function SampleViewerModal({ sample, onClose }) {
  useEffect(() => {
    if (!sample) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [sample, onClose]);

  if (!sample) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-slate-900/70 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={sample.title}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl mt-4 sm:mt-0 rounded-2xl bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-slate-100">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-brand-600">
              {sample.label}
            </p>
            <h3 className="font-display font-bold text-slate-900 text-base sm:text-lg">
              {sample.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="shrink-0 h-9 w-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto bg-slate-50 px-4 py-4 sm:px-6 sm:py-6">
          <img
            src={sample.image}
            alt={`Preview of ${sample.title}`}
            className="w-full h-auto rounded-lg border border-slate-200 shadow-sm"
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-3 px-5 py-4 border-t border-slate-100 bg-white">
          <a href={sample.pdf} download className="btn-primary w-full text-center">
            Download this sample (PDF)
          </a>
          <button type="button" onClick={onClose} className="btn-secondary w-full text-center">
            Keep browsing
          </button>
        </div>
      </div>
    </div>
  );
}

function SampleCard({ sample, onView }) {
  return (
    <div className="card-pad flex flex-col">
      <button
        type="button"
        onClick={() => onView(sample)}
        className="group relative block rounded-xl overflow-hidden border border-slate-200 bg-slate-50 mb-4"
      >
        <img
          src={sample.image}
          alt={`Preview of ${sample.title}`}
          className="w-full h-44 object-cover object-top group-hover:scale-[1.03] transition-transform duration-300"
        />
        <span className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/10 transition-colors" />
        <span className="absolute bottom-2 right-2 text-[10px] font-semibold uppercase tracking-wide bg-white/95 text-slate-700 rounded-full px-2.5 py-1 shadow-sm">
          Tap to view
        </span>
      </button>

      <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-600">
        {sample.label}
      </p>
      <h3 className="font-semibold text-slate-900 text-sm mt-1">{sample.title}</h3>
      <p className="text-sm text-slate-500 mt-1.5 leading-relaxed flex-1">{sample.body}</p>

      <div className="flex items-center gap-2 mt-4">
        <button type="button" onClick={() => onView(sample)} className="btn-secondary btn-sm flex-1 text-center">
          View sample
        </button>
        <a href={sample.pdf} download className="btn-primary btn-sm flex-1 text-center">
          Download
        </a>
      </div>
    </div>
  );
}

function CheckIcon({ className }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <circle cx="10" cy="10" r="10" fill="currentColor" opacity="0.12" />
      <path d="M6 10.2l2.4 2.4L14 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function XIcon({ className }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <circle cx="10" cy="10" r="10" fill="currentColor" opacity="0.1" />
      <path d="M7 7l6 6M13 7l-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ReportCardMockup() {
  return (
    <div className="relative w-full max-w-md mx-auto lg:mx-0">
      {/* the "old way": a chaotic spreadsheet peeking out from behind */}
      <div
        aria-hidden="true"
        className="absolute -top-5 -right-5 w-[85%] rotate-3 rounded-xl border border-slate-200 bg-white shadow-sm opacity-70 hidden sm:block"
      >
        <div className="px-3 py-2 border-b border-slate-100 text-[10px] font-mono text-slate-400">
          RESULTS_TERM2_FINAL_v3(1).xlsx
        </div>
        <div className="p-2 grid grid-cols-4 gap-1">
          {Array.from({ length: 16 }).map((_, i) => (
            <div
              key={i}
              className={`h-4 rounded-sm ${
                i % 7 === 3 ? "bg-rose-100" : "bg-slate-100"
              }`}
            />
          ))}
        </div>
      </div>

      {/* the "CMSEDU way": clean, generated report card */}
      <div className="relative rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5 cmsedu-card-in overflow-hidden">
        <div className="bg-brand-600 px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-white font-display font-bold text-sm">Term Report Card</p>
            <p className="text-brand-100 text-[11px]">2nd Term · 2025/2026 Session</p>
          </div>
          <span className="h-8 w-8 rounded-lg bg-white/15 text-white flex items-center justify-center text-xs font-semibold">
            SS2
          </span>
        </div>

        <div className="px-5 py-4">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-3">
            <span>Adaeze O. — SS2 Gold</span>
            <span className="font-mono">Position: 3rd / 42</span>
          </div>

          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-100">
                <th className="font-normal pb-1.5">Subject</th>
                <th className="font-normal pb-1.5 text-right">Score</th>
                <th className="font-normal pb-1.5 text-right">Grade</th>
              </tr>
            </thead>
            <tbody className="text-slate-700">
              {[
                ["Mathematics", 88, "A", "text-emerald-600"],
                ["English Language", 74, "B2", "text-emerald-600"],
                ["Biology", 65, "C4", "text-amber-600"],
                ["Economics", 91, "A", "text-emerald-600"],
              ].map(([subj, score, grade, color]) => (
                <tr key={subj} className="border-b border-slate-50 last:border-0">
                  <td className="py-1.5">{subj}</td>
                  <td className="py-1.5 text-right font-mono">{score}</td>
                  <td className={`py-1.5 text-right font-mono font-semibold ${color}`}>{grade}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
            <p className="text-[11px] text-slate-400">Class teacher's remark</p>
            <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5">
              Excellent progress
            </span>
          </div>
        </div>
      </div>

      <span
        aria-hidden="true"
        className="absolute -bottom-4 -left-4 rotate-[-8deg] rounded-lg border-2 border-brand-600 text-brand-600 text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 bg-white shadow-md hidden sm:block"
      >
        Generated in 1 click
      </span>
    </div>
  );
}

export default function Landing() {
  const [activeSample, setActiveSample] = useState(null);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <style>{`
        @keyframes cmseduFadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .cmsedu-fade-up { animation: cmseduFadeUp 0.7s ease-out both; }
        .cmsedu-fade-up-1 { animation-delay: 0.05s; }
        .cmsedu-fade-up-2 { animation-delay: 0.15s; }
        .cmsedu-fade-up-3 { animation-delay: 0.25s; }
        .cmsedu-card-in { animation: cmseduFadeUp 0.8s ease-out both; animation-delay: 0.2s; }
        @media (prefers-reduced-motion: reduce) {
          .cmsedu-fade-up, .cmsedu-fade-up-1, .cmsedu-fade-up-2, .cmsedu-fade-up-3, .cmsedu-card-in {
            animation: none;
          }
        }
      `}</style>

      <header className="px-5 sm:px-8 py-5 flex items-center justify-between">
        <div className="inline-flex items-center gap-2 font-display font-extrabold text-slate-900 text-lg">
          <img src="/logo.png" alt="CMSEDU logo" className="h-9 w-9 rounded-lg object-contain" />
          CMSEDU
        </div>
        <a href={WHATSAPP_HREF} className="btn-secondary btn-sm hidden sm:inline-flex">
          Talk to us
        </a>
      </header>

      <main className="flex-1">
        {/* HERO */}
        <section className="px-5 sm:px-8 py-10 sm:py-16 max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
          <div className="text-center lg:text-left cmsedu-fade-up">
            <span className="badge-brand mb-5 inline-block">Result Management Platform</span>
            <h1 className="font-display font-extrabold text-slate-900 text-3xl sm:text-5xl leading-tight">
              Report cards your teachers finish in minutes, not weekends.
            </h1>
            <p className="text-slate-500 text-base sm:text-lg mt-4 max-w-xl mx-auto lg:mx-0">
              CMSEDU replaces scattered Excel sheets and manual re-typing with one clean system,
              built around JSS &amp; SS grading scales — so every report card is accurate,
              print-ready, and issued on time, every term.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 mt-8 max-w-md mx-auto lg:mx-0">
              <a href={WHATSAPP_HREF} className="btn-primary w-full text-center">
                Chat with us on WhatsApp
              </a>
              <a href={TEL_HREF} className="btn-secondary w-full text-center">
                Call {DISPLAY_PHONE}
              </a>
            </div>
            <p className="text-xs text-slate-400 mt-3">
              Free consultation — we'll walk you through setup for your school.
            </p>
          </div>

          <div className="cmsedu-fade-up cmsedu-fade-up-2">
            <ReportCardMockup />
          </div>
        </section>

        {/* PAIN / GAIN */}
        <section className="px-5 sm:px-8 py-12 sm:py-16 bg-white border-y border-slate-100">
          <div className="max-w-5xl mx-auto">
            <div className="text-center max-w-xl mx-auto mb-10">
              <h2 className="font-display font-bold text-slate-900 text-2xl sm:text-3xl">
                You already know the old way isn't working
              </h2>
              <p className="text-slate-500 mt-3">
                Most schools don't need more software. They need the one thing that
                actually removes the busywork around results.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-6">
              <div className="card-pad">
                <p className="field-label mb-3 text-slate-400">The old way</p>
                <ul className="space-y-3">
                  {PAIN_POINTS.map((p) => (
                    <li key={p} className="flex items-start gap-2.5 text-sm text-slate-600">
                      <XIcon className="h-5 w-5 shrink-0 text-rose-500 mt-0.5" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="card-pad ring-1 ring-brand-100">
                <p className="field-label mb-3 text-brand-600">With CMSEDU</p>
                <ul className="space-y-3">
                  {GAINS.map((g) => (
                    <li key={g} className="flex items-start gap-2.5 text-sm text-slate-700">
                      <CheckIcon className="h-5 w-5 shrink-0 text-emerald-600 mt-0.5" />
                      <span>{g}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section className="px-5 sm:px-8 py-12 sm:py-16 max-w-6xl mx-auto">
          <div className="text-center max-w-xl mx-auto mb-10">
            <h2 className="font-display font-bold text-slate-900 text-2xl sm:text-3xl">
              Everything a school needs, nothing it doesn't
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="card-pad">
                <h3 className="font-semibold text-slate-900 text-sm">{f.title}</h3>
                <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* SAMPLE REPORT CARDS */}
        <section className="px-5 sm:px-8 py-12 sm:py-16 bg-white border-y border-slate-100">
          <div className="max-w-6xl mx-auto">
            <div className="text-center max-w-xl mx-auto mb-10">
              <span className="badge-brand mb-4 inline-block">Real output, not a mockup</span>
              <h2 className="font-display font-bold text-slate-900 text-2xl sm:text-3xl">
                See the actual report cards CMSEDU generates
              </h2>
              <p className="text-slate-500 mt-3">
                These are real one-click exports — JSS and SS1 layouts, at different points in the
                term. Tap any card to view it full-size, no download needed. Download it if you
                want to keep a copy.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {SAMPLES.map((s) => (
                <SampleCard key={s.id} sample={s} onView={setActiveSample} />
              ))}
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="px-5 sm:px-8 py-12 sm:py-16 bg-white border-y border-slate-100">
          <div className="max-w-5xl mx-auto">
            <div className="text-center max-w-xl mx-auto mb-10">
              <h2 className="font-display font-bold text-slate-900 text-2xl sm:text-3xl">
                Getting started takes days, not months
              </h2>
              <p className="text-slate-500 mt-3">
                We set your school up ourselves — there's no software to figure out on your own.
              </p>
            </div>
            <div className="grid sm:grid-cols-3 gap-6">
              {STEPS.map((s) => (
                <div key={s.n} className="text-center sm:text-left">
                  <span className="font-mono text-brand-600 text-sm font-semibold">{s.n}</span>
                  <h3 className="font-semibold text-slate-900 text-sm mt-1.5">{s.title}</h3>
                  <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CONTACT CTA */}
        <section className="px-5 sm:px-8 py-14 sm:py-20">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="font-display font-extrabold text-slate-900 text-2xl sm:text-4xl leading-tight">
              Let's set your school up on CMSEDU
            </h2>
            <p className="text-slate-500 mt-4">
              Reach out for a free consultation — we'll go through your school's
              structure with you and handle the setup ourselves.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 mt-8 max-w-sm mx-auto">
              <a href={WHATSAPP_HREF} className="btn-primary w-full text-center">
                Chat on WhatsApp
              </a>
              <a href={TEL_HREF} className="btn-secondary w-full text-center">
                Call {DISPLAY_PHONE}
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="px-5 py-6 text-center text-xs text-slate-400 space-y-1">
        <p>
          Questions? Reach us on WhatsApp or call{" "}
          <a href={TEL_HREF} className="text-brand-600 font-medium">
            {DISPLAY_PHONE}
          </a>
        </p>
        <p>© {new Date().getFullYear()} CMSEDU. All rights reserved.</p>
      </footer>

      <SampleViewerModal sample={activeSample} onClose={() => setActiveSample(null)} />
    </div>
  );
}