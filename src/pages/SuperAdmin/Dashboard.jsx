import { useEffect, useState } from "react";
import { addDoc, collection, doc, onSnapshot, orderBy, query, setDoc } from "firebase/firestore";
import { db, auth } from "../../firebase/config";

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

export default function SuperAdminDashboard() {
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
    <div className="max-w-2xl mx-auto mt-16 flex flex-col gap-10">
      <div>
        <h2 className="text-xl font-semibold mb-4">Onboard a new school</h2>
        <form onSubmit={createSchool} className="flex flex-col gap-3 max-w-lg">
          <input
            className="border p-2 rounded"
            placeholder="School name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            className="border p-2 rounded"
            placeholder="Slug (e.g. gaskiya)"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            required
          />
          <select className="border p-2 rounded" value={gradingScale} onChange={(e) => setGradingScale(e.target.value)}>
            <option value="JSS">Junior Secondary (JSS)</option>
            <option value="SS">Senior Secondary (SS)</option>
          </select>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button className="bg-slate-900 text-white p-2 rounded disabled:opacity-50" disabled={creating}>
            {creating ? "Creating…" : "Create school"}
          </button>
        </form>
        {created && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded max-w-lg">
            <p>
              School created. Access route: <b>/educms/{created.slug}</b>
            </p>
            <p>
              Access code (give this to the school admin): <b>{created.accessCode}</b>
            </p>
            <p className="text-xs text-slate-500 mt-1">
              They'll use "First time? Activate access" on that login page to set up their own password.
            </p>
          </div>
        )}
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-4">Schools</h2>
        <div className="flex flex-col gap-2">
          {schools.map((s) => (
            <SchoolRow key={s.id} school={s} />
          ))}
          {schools.length === 0 && <p className="text-slate-400 text-sm">No schools yet.</p>}
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
    <div className="border rounded p-3 flex flex-col gap-1 text-sm">
      <div className="flex items-center justify-between">
        <div>
          <span className="font-medium">{school.name}</span>{" "}
          <span className="text-slate-400">/educms/{school.slug}</span>
        </div>
        <span
          className={`text-xs px-2 py-0.5 rounded-full ${
            school.adminClaimed ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
          }`}
        >
          {school.adminClaimed ? "Admin activated" : "Pending activation"}
        </span>
      </div>

      {!school.adminClaimed && <p className="text-slate-500">Access code: {revealCode || school.accessCode}</p>}
      {error && <p className="text-red-600">{error}</p>}

      <div className="flex gap-3 mt-1">
        {!school.adminClaimed && (
          <button className="text-blue-600 disabled:opacity-50" disabled={busy} onClick={() => run("regenerateCode")}>
            Regenerate code
          </button>
        )}
        {school.adminClaimed && (
          <button className="text-red-600 disabled:opacity-50" disabled={busy} onClick={() => run("revokeAdmin")}>
            Revoke admin access
          </button>
        )}
      </div>
    </div>
  );
}
