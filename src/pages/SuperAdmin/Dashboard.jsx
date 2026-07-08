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

export default function SuperAdminDashboard() {
  const { logout } = useAuth();
  return (
    <AppShell eyebrow="Super Admin" title="CMSEDU Platform" subtitle="Onboard & manage schools" navItems={TABS} onLogout={logout}>
      <DashboardBody />
    </AppShell>
  );
}

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
      <div>
        <h2 className="page-title">Onboard a new school</h2>
        <p className="page-subtitle mb-4">Creates the school record and a one-time activation code.</p>
        <form onSubmit={createSchool} className="card-pad flex flex-col gap-4 max-w-lg">
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
          <button className="btn-primary self-start px-6" disabled={creating}>
            {creating ? "Creating…" : "Create school"}
          </button>
        </form>
        {created && (
          <div className="mt-4 card-pad max-w-lg bg-emerald-50 border-emerald-200">
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
        <h2 className="page-title">Schools ({schools.length})</h2>
        <p className="page-subtitle mb-4">Manage activation status and access codes.</p>
        <div className="flex flex-col gap-3">
          {schools.map((s) => (
            <SchoolRow key={s.id} school={s} />
          ))}
          {schools.length === 0 && <div className="card-pad text-center text-slate-400 text-sm">No schools yet.</div>}
        </div>
      </div>
    </div>
  );
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
    <div className="row-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-slate-900 text-sm">{school.name}</p>
          <p className="text-slate-400 text-xs mt-0.5">/educms/{school.slug}</p>
        </div>
        <span className={school.adminClaimed ? "badge-green" : "badge-amber"}>
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
