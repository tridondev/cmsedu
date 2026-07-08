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
    <div className="flex flex-col gap-8 max-w-3xl">
      <div>
        <h3 className="text-lg font-semibold mb-3">Invite a teacher</h3>
        {classes.length === 0 ? (
          <p className="text-amber-600 text-sm">Create a class with subjects first — you'll assign the teacher to specific ones below.</p>
        ) : (
          <form onSubmit={invite} className="flex flex-col gap-3 border rounded p-4">
            <div className="flex gap-3">
              <input className="border p-2 rounded flex-1" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
              <input className="border p-2 rounded flex-1" placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <input className="border p-2 rounded flex-1" placeholder="Temp password (min 8 chars)" type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>

            <div>
              <label className="text-sm font-medium">Assign to class/subject</label>
              <div className="flex flex-col gap-2 mt-2 max-h-56 overflow-y-auto border rounded p-2">
                {classes.map((c) => (
                  <div key={c.id}>
                    <p className="text-xs font-semibold text-slate-500">{c.name}</p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {(c.subjects || []).map((s) => {
                        const key = `${c.id}:${s.id}`;
                        return (
                          <label key={key} className={`text-xs px-2 py-1 rounded-full border cursor-pointer ${selected[key] ? "bg-slate-900 text-white" : ""}`}>
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

            {error && <p className="text-red-600 text-sm">{error}</p>}
            {success && <p className="text-green-700 text-sm">{success}</p>}
            <button className="bg-slate-900 text-white p-2 rounded disabled:opacity-50 self-start px-4" disabled={saving}>
              {saving ? "Creating…" : "Create teacher account"}
            </button>
          </form>
        )}
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-3">Teachers ({teachers.length})</h3>
        <div className="flex flex-col gap-2">
          {teachers.map((t) => (
            <div key={t.id} className="border rounded p-3 text-sm">
              <p className="font-medium">
                {t.name} <span className="text-slate-400 font-normal">{t.email}</span>
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
          {teachers.length === 0 && <p className="text-slate-400 text-sm">No teachers yet.</p>}
        </div>
      </div>
    </div>
  );
}
