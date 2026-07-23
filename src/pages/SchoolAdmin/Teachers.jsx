import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
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

  // Managing (reassign/remove) an existing teacher's class/subject assignments
  const [managingId, setManagingId] = useState(null);
  const [managingSelected, setManagingSelected] = useState({});
  const [managingSaving, setManagingSaving] = useState(false);
  const [managingError, setManagingError] = useState(null);

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

  const [lockingId, setLockingId] = useState(null);

  const toggleLock = async (teacher) => {
    const nextLocked = !teacher.locked;
    if (!confirm(nextLocked ? `Lock ${teacher.name}? They won't be able to edit their assigned courses until unlocked.` : `Unlock ${teacher.name}? They'll regain edit access to their assigned courses.`)) {
      return;
    }
    setLockingId(teacher.id);
    try {
      await updateDoc(doc(db, "schools", schoolId, "users", teacher.id), { locked: nextLocked });
    } catch (err) {
      alert(err.message);
    } finally {
      setLockingId(null);
    }
  };

  const removeAssignment = async (teacher, classId, subjectId) => {
    if (!confirm("Remove this assignment? The teacher will no longer see this class/subject.")) return;
    const next = (teacher.assignedSubjects || []).filter((a) => !(a.classId === classId && a.subjectId === subjectId));
    await updateDoc(doc(db, "schools", schoolId, "users", teacher.id), { assignedSubjects: next });
  };

  const startManage = (teacher) => {
    const map = {};
    (teacher.assignedSubjects || []).forEach((a) => (map[`${a.classId}:${a.subjectId}`] = true));
    setManagingId(teacher.id);
    setManagingSelected(map);
    setManagingError(null);
  };

  const cancelManage = () => {
    setManagingId(null);
    setManagingSelected({});
    setManagingError(null);
  };

  const toggleManaging = (classId, subjectId) => {
    const key = `${classId}:${subjectId}`;
    setManagingSelected({ ...managingSelected, [key]: !managingSelected[key] });
  };

  const saveManage = async () => {
    const next = Object.entries(managingSelected)
      .filter(([, checked]) => checked)
      .map(([key]) => {
        const [classId, subjectId] = key.split(":");
        return { classId, subjectId };
      });
    setManagingSaving(true);
    setManagingError(null);
    try {
      await updateDoc(doc(db, "schools", schoolId, "users", managingId), { assignedSubjects: next });
      cancelManage();
    } catch (err) {
      setManagingError(err.message);
    } finally {
      setManagingSaving(false);
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
              <div className="sm:flex sm:items-start sm:justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 text-sm flex items-center gap-2 flex-wrap">
                    {t.name} <span className="text-slate-400 font-normal">· {t.email}</span>
                    {t.locked ? (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-100">
                        🔒 Locked
                      </span>
                    ) : (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                        Unlocked
                      </span>
                    )}
                  </p>
                  {(t.assignedSubjects || []).length === 0 ? (
                    <p className="text-slate-400 text-xs mt-1">No assignments</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {(t.assignedSubjects || []).map((a) => {
                        const cls = classes.find((c) => c.id === a.classId);
                        const subj = cls?.subjects?.find((s) => s.id === a.subjectId);
                        return (
                          <span key={`${a.classId}:${a.subjectId}`} className="badge-slate pr-1.5">
                            {cls?.name || a.classId} · {subj?.name || a.subjectId}
                            {!t.locked && (
                              <button
                                type="button"
                                title="Remove this assignment"
                                className="h-4 w-4 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-600 flex items-center justify-center text-xs"
                                onClick={() => removeAssignment(t, a.classId, a.subjectId)}
                              >
                                ×
                              </button>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 shrink-0 mt-2 sm:mt-0">
                  <button
                    className={`btn-sm ${t.locked ? "btn-primary" : "btn-secondary"}`}
                    disabled={lockingId === t.id}
                    onClick={() => toggleLock(t)}
                  >
                    {lockingId === t.id ? "…" : t.locked ? "Unlock" : "Lock"}
                  </button>
                  <button
                    className="btn-sm btn-secondary"
                    disabled={t.locked}
                    title={t.locked ? "Unlock this teacher to change assignments" : ""}
                    onClick={() => (managingId === t.id ? cancelManage() : startManage(t))}
                  >
                    {managingId === t.id ? "Cancel" : "Reassign"}
                  </button>
                </div>
              </div>

              {managingId === t.id && (
                <div className="mt-3 pt-3 border-t border-slate-100 flex flex-col gap-3">
                  <label className="field-label">Assign {t.name} to class/subject</label>
                  <div className="flex flex-col gap-3 max-h-64 overflow-y-auto border border-slate-200 rounded-xl p-3">
                    {classes.map((c) => (
                      <div key={c.id}>
                        <p className="text-xs font-semibold text-slate-500">{c.name}</p>
                        <div className="flex flex-wrap gap-2 mt-1.5">
                          {(c.subjects || []).map((s) => {
                            const key = `${c.id}:${s.id}`;
                            return (
                              <label key={key} className={`chip ${managingSelected[key] ? "chip-active" : ""}`}>
                                <input
                                  type="checkbox"
                                  className="hidden"
                                  checked={!!managingSelected[key]}
                                  onChange={() => toggleManaging(c.id, s.id)}
                                />
                                {s.name}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    {classes.length === 0 && <p className="text-slate-400 text-xs">No classes yet.</p>}
                  </div>
                  {managingError && (
                    <p className="text-red-600 text-sm bg-red-50 border border-red-100 rounded-lg px-3 py-2">{managingError}</p>
                  )}
                  <div className="flex gap-2">
                    <button className="btn-primary btn-sm px-5" disabled={managingSaving} onClick={saveManage}>
                      {managingSaving ? "Saving…" : "Save assignments"}
                    </button>
                    <button className="btn-ghost btn-sm" onClick={cancelManage}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {teachers.length === 0 && <div className="card-pad text-center text-slate-400 text-sm">No teachers yet.</div>}
        </div>
      </div>
    </div>
  );
}