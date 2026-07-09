import { useEffect, useState } from "react";
import { addDoc, collection, doc, onSnapshot, orderBy, query, setDoc } from "firebase/firestore";
import { db, auth } from "../../firebase/config";
import { useAuth } from "../../context/AuthContext";
import AppShell from "../../components/AppShell";

function randomAccessCode(prefix) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return `${(prefix || "SCH").slice(0, 3).toUpperCase()}-${code}`;
}

/** Calls a Netlify function that requires the caller's platformAdmin token. */
async function callAdminAction(action, schoolId) {
  const idToken = await auth.currentUser.getIdToken();
  const res = await fetch("/.netlify/functions/schoolAdminActions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ action, schoolId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Action failed");
  return data;
}

const TABS = [{ to: "", label: "Schools", end: true }];

const WHATSAPP_NUMBER = "2348107344084"; // no "+", no leading 0 duplication — wa.me expects country code + number
const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("Hello, I need help with CMSEDU.")}`;

export default function SuperAdminDashboard() {
  const { logout } = useAuth();
  return (
    <AppShell eyebrow="Super Admin" title="CMSEDU Platform" subtitle="Onboard & manage schools" navItems={TABS} onLogout={logout}>
      <DashboardBody />
      <FloatingWhatsAppButton />
    </AppShell>
  );
}

/** Fixed bottom-right button so support is always one tap away, on every scroll position. */
function FloatingWhatsAppButton() {
  return (
    <a
      href={WHATSAPP_LINK}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-3 text-white text-sm font-semibold shadow-lg hover:bg-emerald-600 transition-colors"
      title="Chat with us on WhatsApp"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 shrink-0">
        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.96L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm5.8 14.09c-.24.68-1.4 1.3-1.93 1.38-.49.08-1.11.11-1.79-.11a16.3 16.3 0 0 1-1.62-.6c-2.85-1.23-4.7-4.1-4.85-4.29-.14-.19-1.16-1.54-1.16-2.94 0-1.4.73-2.08 1-2.37.26-.28.58-.35.77-.35h.55c.18 0 .42-.03.65.5.24.56.81 1.94.88 2.08.07.14.11.31.02.5-.09.19-.14.31-.28.47-.14.16-.29.36-.42.48-.14.14-.28.29-.12.56.16.28.71 1.17 1.53 1.9 1.05.94 1.94 1.23 2.21 1.37.28.14.44.12.6-.07.16-.19.68-.79.87-1.06.18-.28.37-.23.62-.14.26.09 1.63.77 1.91.91.28.14.46.21.53.33.07.12.07.68-.17 1.36Z" />
      </svg>
      <span className="hidden sm:inline">Need help?</span>
    </a>
  );
}

function StatCard({ label, value, tone, icon }) {
  const tones = {
    indigo: "bg-white/10 text-white",
    emerald: "bg-emerald-400/20 text-emerald-50",
    amber: "bg-amber-400/20 text-amber-50",
  };
  return (
    <div className={`flex items-center gap-3 rounded-2xl px-4 py-3 backdrop-blur-sm ${tones[tone]}`}>
      <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">{icon}</div>
      <div>
        <p className="text-2xl font-extrabold leading-none">{value}</p>
        <p className="text-xs opacity-80 mt-1">{label}</p>
      </div>
    </div>
  );
}

const IconSchool = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <path d="M12 3 2 8l10 5 10-5-10-5Z" />
    <path d="M6 10.5V16c0 1 2.5 3 6 3s6-2 6-3v-5.5" />
  </svg>
);
const IconCheck = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <path d="m20 6-11 11L4 12" />
  </svg>
);
const IconClock = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 3" />
  </svg>
);
const IconSparkles = (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path d="M12 2 13.6 8.4 20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6L12 2Z" />
  </svg>
);
const IconBolt = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
  </svg>
);
const IconShield = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <path d="M12 3 4 6v6c0 5 3.5 7.5 8 9 4.5-1.5 8-4 8-9V6l-8-3Z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);
const IconFileCheck = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" />
    <path d="M14 2v6h6" />
    <path d="m9 15 2 2 4-4" />
  </svg>
);
const IconUsers = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
const IconCloud = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <path d="M17.5 19a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.4-1.5A4.5 4.5 0 0 0 6.5 19h11Z" />
  </svg>
);
const IconHeadset = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <path d="M3 14v-2a9 9 0 0 1 18 0v2" />
    <path d="M21 14a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2v2Z" />
    <path d="M3 14a2 2 0 0 0 2 2h1v-6H5a2 2 0 0 0-2 2v2Z" />
    <path d="M17 18.5a3 3 0 0 1-3 2.5h-2" />
  </svg>
);

const BENEFITS = [
  {
    icon: IconBolt,
    tone: "bg-indigo-50 text-indigo-600",
    title: "Hours saved every term",
    body: "Teachers just enter raw scores — averages, positions, and grades are calculated automatically. No more manual Excel formulas or late-night marking.",
  },
  {
    icon: IconFileCheck,
    tone: "bg-emerald-50 text-emerald-600",
    title: "Print-ready report cards",
    body: "Every export matches the school's real template — fonts, logos, signatures, and layout — and lands on exactly one page, ready to print.",
  },
  {
    icon: IconShield,
    tone: "bg-violet-50 text-violet-600",
    title: "Nothing gets lost",
    body: "Every score, remark, and record is cloud-synced and backed up in real time — no more corrupted USB drives or a single laptop holding a whole term's work.",
  },
  {
    icon: IconUsers,
    tone: "bg-amber-50 text-amber-600",
    title: "Built for every role",
    body: "Teachers score, form masters remark, principals approve, admins oversee — each with their own login and the right level of access.",
  },
  {
    icon: IconCloud,
    tone: "bg-sky-50 text-sky-600",
    title: "Access from anywhere",
    body: "No installs, no local server. Staff can log in and work from any phone, tablet, or computer, on or off campus.",
  },
  {
    icon: IconHeadset,
    tone: "bg-rose-50 text-rose-600",
    title: "Real support, not a bot",
    body: "Questions or issues during setup? Message us directly on WhatsApp and get a real answer — not a ticket queue.",
  },
];

function DashboardBody() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [gradingScale, setGradingScale] = useState("JSS");
  const [created, setCreated] = useState(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);
  const [schools, setSchools] = useState([]);

  useEffect(() => {
    const q = query(collection(db, "schools"), orderBy("name"));
    return onSnapshot(q, (snap) => {
      setSchools(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, []);

  const activatedCount = schools.filter((s) => s.adminClaimed).length;
  const pendingCount = schools.length - activatedCount;

  const createSchool = async (e) => {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const accessCode = randomAccessCode(slug);
      const schoolRef = await addDoc(collection(db, "schools"), {
        name,
        slug,
        gradingScale,
        accessCode,
        status: "active",
        adminClaimed: false,
        adminUid: null,
        streamsForSS: ["Science", "Art", "Commercial"],
        currentSession: "2025/2026",
        currentTerm: "First",
        createdAt: Date.now(),
      });
      await setDoc(doc(db, "slugs", slug), { schoolId: schoolRef.id });
      setCreated({ id: schoolRef.id, accessCode, slug });
      setName("");
      setSlug("");
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col gap-10">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <img src="/logo.png" alt="CMSEDU" className="h-12 w-auto" />
        <a
          href={WHATSAPP_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="card-pad flex items-center gap-3 hover:bg-emerald-50 hover:border-emerald-200 hover:shadow-md hover:-translate-y-0.5 transition-all max-w-sm"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-emerald-500 shrink-0">
            <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.96L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm5.8 14.09c-.24.68-1.4 1.3-1.93 1.38-.49.08-1.11.11-1.79-.11a16.3 16.3 0 0 1-1.62-.6c-2.85-1.23-4.7-4.1-4.85-4.29-.14-.19-1.16-1.54-1.16-2.94 0-1.4.73-2.08 1-2.37.26-.28.58-.35.77-.35h.55c.18 0 .42-.03.65.5.24.56.81 1.94.88 2.08.07.14.11.31.02.5-.09.19-.14.31-.28.47-.14.16-.29.36-.42.48-.14.14-.28.29-.12.56.16.28.71 1.17 1.53 1.9 1.05.94 1.94 1.23 2.21 1.37.28.14.44.12.6-.07.16-.19.68-.79.87-1.06.18-.28.37-.23.62-.14.26.09 1.63.77 1.91.91.28.14.46.21.53.33.07.12.07.68-.17 1.36Z" />
          </svg>
          <div>
            <p className="font-semibold text-slate-900 text-sm">Need consulting or have an enquiry?</p>
            <p className="text-slate-500 text-xs mt-0.5">Chat with us on WhatsApp — +234 810 734 4084</p>
          </div>
        </a>
      </div>

      {/* Hero: gradient welcome banner with live platform stats */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-indigo-500 to-violet-600 px-6 py-8 sm:px-10 sm:py-10 text-white shadow-xl shadow-indigo-200">
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-20 -left-10 w-72 h-72 rounded-full bg-violet-400/20 blur-3xl" />
        <div className="relative flex flex-col gap-6">
          <div className="flex items-center gap-2 text-indigo-100 text-sm font-medium">
            {IconSparkles}
            <span>Super Admin control center</span>
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Welcome back 👋</h1>
            <p className="text-indigo-100 mt-1.5 max-w-xl text-sm sm:text-base">
              Onboard new schools, hand out activation codes, and keep every campus on CMSEDU running smoothly — all
              from one place.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <StatCard label="Schools onboarded" value={schools.length} tone="indigo" icon={IconSchool} />
            <StatCard label="Admin activated" value={activatedCount} tone="emerald" icon={IconCheck} />
            <StatCard label="Pending activation" value={pendingCount} tone="amber" icon={IconClock} />
          </div>
        </div>
      </div>

      {/* Benefits: reasons to onboard a school, and a quick reference you can
          talk a prospective school through on a call. */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">{IconSparkles}</span>
          <h2 className="page-title">Why schools choose CMSEDU</h2>
        </div>
        <p className="page-subtitle mb-4">What you're giving every school you onboard.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {BENEFITS.map((b) => (
            <div
              key={b.title}
              className="card-pad flex flex-col gap-3 hover:shadow-md hover:-translate-y-0.5 hover:border-indigo-200 transition-all"
            >
              <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${b.tone}`}>{b.icon}</span>
              <div>
                <p className="font-semibold text-slate-900 text-sm">{b.title}</p>
                <p className="text-slate-500 text-xs mt-1 leading-relaxed">{b.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">{IconSchool}</span>
          <h2 className="page-title">Onboard a new school</h2>
        </div>
        <p className="page-subtitle mb-4">Creates the school record and a one-time activation code.</p>
        <form
          onSubmit={createSchool}
          className="card-pad flex flex-col gap-4 max-w-lg border-t-4 border-t-indigo-500 shadow-sm hover:shadow-md transition-shadow"
        >
          <div>
            <label className="field-label">School name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className="field-label">Slug</label>
            <input
              className="input"
              placeholder="e.g. gaskiya"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              required
            />
            <p className="text-xs text-slate-400 mt-1">Login URL will be /educms/{slug || "<slug>"}</p>
          </div>
          <div>
            <label className="field-label">Grading scale</label>
            <select className="input" value={gradingScale} onChange={(e) => setGradingScale(e.target.value)}>
              <option value="JSS">Junior Secondary (JSS)</option>
              <option value="SS">Senior Secondary (SS)</option>
            </select>
          </div>
          {error && <p className="text-red-600 text-sm bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
          <button className="btn-primary self-start px-6 hover:shadow-lg hover:-translate-y-0.5 transition-all" disabled={creating}>
            {creating ? "Creating…" : "Create school"}
          </button>
        </form>
        {created && (
          <div className="mt-4 card-pad max-w-lg bg-emerald-50 border-emerald-200 animate-[pulse_1s_ease-in-out_1]">
            <p className="text-sm text-emerald-900">
              School created. Access route: <b>/educms/{created.slug}</b>
            </p>
            <p className="text-sm text-emerald-900 mt-1">
              Access code (give this to the school admin): <b>{created.accessCode}</b>
            </p>
            <p className="text-xs text-emerald-700 mt-2">
              They'll use "First time" on that login page to set up their own password.
            </p>
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">{IconSchool}</span>
          <h2 className="page-title">Schools ({schools.length})</h2>
        </div>
        <p className="page-subtitle mb-4">Manage activation status and access codes.</p>
        <div className="flex flex-col gap-3">
          {schools.map((s) => (
            <SchoolRow key={s.id} school={s} />
          ))}
          {schools.length === 0 && (
            <div className="card-pad text-center py-10 flex flex-col items-center gap-2 text-slate-400">
              <span className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-400 flex items-center justify-center">{IconSchool}</span>
              <p className="text-sm font-medium text-slate-500">No schools yet</p>
              <p className="text-xs">Onboard your first school above to see it appear here.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function initials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

const AVATAR_PALETTE = [
  "bg-indigo-100 text-indigo-700",
  "bg-violet-100 text-violet-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-sky-100 text-sky-700",
];

function avatarTone(seed = "") {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

function SchoolRow({ school }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [revealCode, setRevealCode] = useState(null);

  const run = async (action) => {
    setError(null);
    setBusy(true);
    try {
      const result = await callAdminAction(action, school.id);
      if (result.accessCode) setRevealCode(result.accessCode);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="row-card hover:shadow-md hover:-translate-y-0.5 hover:border-indigo-200 transition-all">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${avatarTone(school.name || school.id)}`}>
            {initials(school.name)}
          </div>
          <div>
            <p className="font-semibold text-slate-900 text-sm">{school.name}</p>
            <p className="text-slate-400 text-xs mt-0.5">/educms/{school.slug}</p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 ${school.adminClaimed ? "badge-green" : "badge-amber"}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${school.adminClaimed ? "bg-emerald-500" : "bg-amber-500 animate-pulse"}`} />
          {school.adminClaimed ? "Admin activated" : "Pending activation"}
        </span>
      </div>

      {!school.adminClaimed && <p className="text-slate-500 text-sm mt-2">Access code: {revealCode || school.accessCode}</p>}
      {error && <p className="text-red-600 text-sm mt-1">{error}</p>}

      <div className="flex gap-2 mt-2">
        {!school.adminClaimed && (
          <button className="btn-sm btn-secondary" disabled={busy} onClick={() => run("regenerateCode")}>
            Regenerate code
          </button>
        )}
        {school.adminClaimed && (
          <button className="btn-sm btn-danger" disabled={busy} onClick={() => run("revokeAdmin")}>
            Revoke admin access
          </button>
        )}
      </div>
    </div>
  );
}