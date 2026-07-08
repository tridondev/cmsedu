import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db, auth } from "../../firebase/config";

export default function Teachers({ schoolId }) {
  const [teachers, setTeachers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selected, setSelected] = useState({}); // `${classId}:${subjectId}` -> bool
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "schools", schoolId, "users"), where("role", "==", "teacher"));
    return onSnapshot(q, (snap) => setTeachers(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
  }, [schoolId]);

  useEffect(() => {
    return onSnapshot(collection(db, "schools", schoolId, "classes"), (snap) => {
      setClasses(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [schoolId]);

  const toggle = (classId, subjectId) => {
    const key = `${classId}:${subjectId}`;
    setSelected({ ...selected, [key]: !selected[key] });
  };

  const invite = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const assignedSubjects = Object.entries(selected)
      .filter(([, checked]) => checked)
      .map(([key]) => {
        const [classId, subjectId] = key.split(":");
        return { classId, subjectId };
      });
    if (!name.trim() || !email.trim() || !password) return setError("Fill in name, email, and password");
    if (assignedSubjects.length === 0) return setError("Assign at least one class/subject");

    setSaving(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch("/.netlify/functions/inviteTeacher", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ name, email, password, assignedSubjects }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Invite failed");

      setSuccess(`Teacher account created for ${email}. Give them this login and the URL /educms/<slug>.`);
      setName("");
      setEmail("");
      setPassword("");
      setSelected({});
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h3 className="page-title">Invite a teacher</h3>
        <p className="page-subtitle mb-4">Create a login and assign class/subject responsibilities.</p>
        {classes.length === 0 ? (
          <p className="text-amber-600 text-sm">Create a class with subjects first — you'll assign the teacher to specific ones below.</p>
        ) : (
          <form onSubmit={invite} className="card-pad flex flex-col gap-4 max-w-2xl">
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <label className="field-label">Full name</label>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label className="field-label">Email</label>
                <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label className="field-label">Temp password</label>
                <input className="input" type="text" placeholder="Min 8 chars" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            </div>

            <div>
              <label className="field-label">Assign to class/subject</label>
              <div className="flex flex-col gap-3 max-h-64 overflow-y-auto border border-slate-200 rounded-xl p-3">
                {classes.map((c) => (
                  <div key={c.id}>
                    <p className="text-xs font-semibold text-slate-500">{c.name}</p>
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      {(c.subjects || []).map((s) => {
                        const key = `${c.id}:${s.id}`;
                        return (
                          <label key={key} className={`chip ${selected[key] ? "chip-active" : ""}`}>
                            <input type="checkbox" className="hidden" checked={!!selected[key]} onChange={() => toggle(c.id, s.id)} />
                            {s.name}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {error && <p className="text-red-600 text-sm bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
            {success && <p className="text-emerald-700 text-sm bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">{success}</p>}
            <button className="btn-primary self-start px-6" disabled={saving}>
              {saving ? "Creating…" : "Create teacher account"}
            </button>
          </form>
        )}
      </div>

      <div>
        <h3 className="page-title">Teachers ({teachers.length})</h3>
        <div className="flex flex-col gap-2 mt-4">
          {teachers.map((t) => (
            <div key={t.id} className="row-card">
              <p className="font-semibold text-slate-900 text-sm">
                {t.name} <span className="text-slate-400 font-normal">· {t.email}</span>
              </p>
              <p className="text-slate-500 text-xs mt-1">
                {(t.assignedSubjects || [])
                  .map((a) => {
                    const cls = classes.find((c) => c.id === a.classId);
                    const subj = cls?.subjects?.find((s) => s.id === a.subjectId);
                    return `${cls?.name || a.classId} · ${subj?.name || a.subjectId}`;
                  })
                  .join(", ") || "No assignments"}
              </p>
            </div>
          ))}
          {teachers.length === 0 && <div className="card-pad text-center text-slate-400 text-sm">No teachers yet.</div>}
        </div>
      </div>
    </div>
  );
}
