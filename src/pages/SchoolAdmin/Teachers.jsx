import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, updateDoc, where, writeBatch } from "firebase/firestore";
import { db, auth } from "../../firebase/config";

const keyOf = (classId, subjectId) => `${classId}:${subjectId}`;
const parseKey = (key) => {
  const [classId, subjectId] = key.split(":");
  return { classId, subjectId };
};

// Class/subject chooser with bulk controls (select all / clear all, and
// All / None for each class).
function Picker({ classes, selected, onChange }) {
  const count = Object.values(selected).filter(Boolean).length;
  const setMany = (keys, on) => {
    const next = { ...selected };
    keys.forEach((k) => {
      if (on) next[k] = true;
      else delete next[k];
    });
    onChange(next);
  };
  const allKeys = classes.flatMap((c) => (c.subjects || []).map((s) => keyOf(c.id, s.id)));

  return (
    <div className="border border-slate-200 rounded-xl p-3 flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-slate-500 mr-auto">{count} selected</span>
        <button type="button" className="btn-sm btn-secondary" onClick={() => setMany(allKeys, true)}>
          Select all
        </button>
        <button type="button" className="btn-sm btn-secondary" disabled={count === 0} onClick={() => onChange({})}>
          Clear all
        </button>
      </div>
      <div className="flex flex-col gap-3 max-h-64 overflow-y-auto">
        {classes.map((c) => {
          const keys = (c.subjects || []).map((s) => keyOf(c.id, s.id));
          return (
            <div key={c.id}>
              <div className="flex items-center gap-3">
                <p className="text-xs font-semibold text-slate-500">{c.name}</p>
                {keys.length > 0 && (
                  <>
                    <button type="button" className="text-[11px] text-indigo-600 hover:underline" onClick={() => setMany(keys, true)}>
                      All
                    </button>
                    <button type="button" className="text-[11px] text-slate-500 hover:underline" onClick={() => setMany(keys, false)}>
                      None
                    </button>
                  </>
                )}
              </div>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {(c.subjects || []).map((sub) => {
                  const key = keyOf(c.id, sub.id);
                  return (
                    <label key={key} className={`chip ${selected[key] ? "chip-active" : ""}`}>
                      <input type="checkbox" className="hidden" checked={!!selected[key]} onChange={() => setMany([key], !selected[key])} />
                      {sub.name}
                    </label>
                  );
                })}
                {(c.subjects || []).length === 0 && <span className="text-slate-400 text-xs">No subjects</span>}
              </div>
            </div>
          );
        })}
        {classes.length === 0 && <p className="text-slate-400 text-xs">No classes yet.</p>}
      </div>
    </div>
  );
}

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

  // Bulk actions across several teachers
  const [bulkIds, setBulkIds] = useState({});
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkPick, setBulkPick] = useState({});
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState(null);
  const [bulkErr, setBulkErr] = useState(null);

  useEffect(() => {
    const q = query(collection(db, "schools", schoolId, "users"), where("role", "==", "teacher"));
    return onSnapshot(q, (snap) => setTeachers(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
  }, [schoolId]);

  useEffect(() => {
    return onSnapshot(collection(db, "schools", schoolId, "classes"), (snap) => {
      setClasses(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [schoolId]);

  const invite = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const assignedSubjects = Object.entries(selected)
      .filter(([, checked]) => checked)
      .map(([key]) => parseKey(key));
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

  const diffFor = (teacher) => {
    const before = new Set((teacher.assignedSubjects || []).map((a) => keyOf(a.classId, a.subjectId)));
    const after = new Set(Object.entries(managingSelected).filter(([, v]) => v).map(([k]) => k));
    let added = 0;
    let removed = 0;
    after.forEach((k) => !before.has(k) && added++);
    before.forEach((k) => !after.has(k) && removed++);
    return { added, removed };
  };

  const saveManage = async () => {
    // Only keep assignments whose class and subject still exist.
    const valid = new Set(classes.flatMap((c) => (c.subjects || []).map((s) => keyOf(c.id, s.id))));
    const next = Object.entries(managingSelected)
      .filter(([key, checked]) => checked && valid.has(key))
      .map(([key]) => parseKey(key));
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

  const selectedTeachers = teachers.filter((t) => bulkIds[t.id]);
  const allTeachersSelected = teachers.length > 0 && selectedTeachers.length === teachers.length;
  const toggleTeacher = (id) => setBulkIds((prev) => ({ ...prev, [id]: !prev[id] }));
  const toggleAllTeachers = () => {
    if (allTeachersSelected) return setBulkIds({});
    const next = {};
    teachers.forEach((t) => (next[t.id] = true));
    setBulkIds(next);
  };

  const applyBulk = async (updates, doneMsg) => {
    let batch = writeBatch(db);
    let n = 0;
    for (const { id, assignedSubjects } of updates) {
      batch.update(doc(db, "schools", schoolId, "users", id), { assignedSubjects });
      if (++n % 400 === 0) {
        await batch.commit();
        batch = writeBatch(db);
      }
    }
    if (n % 400 !== 0) await batch.commit();
    setBulkMsg(doneMsg);
  };

  // Remove every course from the ticked teachers (locked teachers are skipped).
  const bulkClear = async () => {
    setBulkErr(null);
    setBulkMsg(null);
    const targets = selectedTeachers.filter((t) => !t.locked);
    const skipped = selectedTeachers.length - targets.length;
    if (targets.length === 0) return setBulkErr("All selected teachers are locked. Unlock them first.");
    if (!confirm(`Remove ALL assigned courses from ${targets.length} teacher${targets.length === 1 ? "" : "s"}?`)) return;
    setBulkBusy(true);
    try {
      await applyBulk(
        targets.map((t) => ({ id: t.id, assignedSubjects: [] })),
        `Cleared courses for ${targets.length} teacher${targets.length === 1 ? "" : "s"}.${skipped ? ` ${skipped} locked teacher${skipped === 1 ? " was" : "s were"} skipped.` : ""}`
      );
      setBulkIds({});
    } catch (err) {
      setBulkErr(err.message);
    } finally {
      setBulkBusy(false);
    }
  };

  // Give the ticked teachers the chosen courses. mode "add" keeps what they
  // already have; mode "replace" wipes their old courses first.
  const bulkAssign = async (mode) => {
    setBulkErr(null);
    setBulkMsg(null);
    const picked = Object.entries(bulkPick).filter(([, v]) => v).map(([k]) => parseKey(k));
    if (picked.length === 0) return setBulkErr("Choose at least one class/subject");
    const targets = selectedTeachers.filter((t) => !t.locked);
    const skipped = selectedTeachers.length - targets.length;
    if (targets.length === 0) return setBulkErr("All selected teachers are locked. Unlock them first.");
    const label = mode === "replace" ? "Replace the courses of" : "Add these courses to";
    if (!confirm(`${label} ${targets.length} teacher${targets.length === 1 ? "" : "s"}?`)) return;
    setBulkBusy(true);
    try {
      await applyBulk(
        targets.map((t) => {
          const base = mode === "replace" ? [] : t.assignedSubjects || [];
          const have = new Set(base.map((a) => keyOf(a.classId, a.subjectId)));
          const merged = [...base, ...picked.filter((a) => !have.has(keyOf(a.classId, a.subjectId)))];
          return { id: t.id, assignedSubjects: merged };
        }),
        `${mode === "replace" ? "Replaced" : "Added"} courses for ${targets.length} teacher${targets.length === 1 ? "" : "s"}.${skipped ? ` ${skipped} locked teacher${skipped === 1 ? " was" : "s were"} skipped.` : ""}`
      );
      setBulkOpen(false);
      setBulkPick({});
      setBulkIds({});
    } catch (err) {
      setBulkErr(err.message);
    } finally {
      setBulkBusy(false);
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
              <Picker classes={classes} selected={selected} onChange={setSelected} />
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
        {teachers.length > 0 && (
          <div className="card-pad mt-4 flex flex-col gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <label className="text-sm text-slate-600 inline-flex items-center gap-2">
                <input type="checkbox" checked={allTeachersSelected} onChange={toggleAllTeachers} />
                Select all ({selectedTeachers.length} selected)
              </label>
              <div className="flex gap-2 sm:ml-auto">
                <button className="btn-sm btn-secondary" disabled={bulkBusy || selectedTeachers.length === 0} onClick={() => { setBulkOpen(!bulkOpen); setBulkErr(null); }}>
                  {bulkOpen ? "Close" : "Bulk assign courses"}
                </button>
                <button className="btn-sm btn-danger" disabled={bulkBusy || selectedTeachers.length === 0} onClick={bulkClear}>
                  Remove all courses
                </button>
              </div>
            </div>
            {bulkOpen && (
              <div className="flex flex-col gap-3 pt-3 border-t border-slate-100">
                <label className="field-label">Courses to give the {selectedTeachers.length} selected teacher{selectedTeachers.length === 1 ? "" : "s"}</label>
                <Picker classes={classes} selected={bulkPick} onChange={setBulkPick} />
                <div className="flex gap-2 flex-wrap">
                  <button className="btn-primary btn-sm px-5" disabled={bulkBusy} onClick={() => bulkAssign("add")}>
                    {bulkBusy ? "Saving…" : "Add to their existing courses"}
                  </button>
                  <button className="btn-secondary btn-sm px-5" disabled={bulkBusy} onClick={() => bulkAssign("replace")}>
                    Replace their existing courses
                  </button>
                </div>
              </div>
            )}
            {bulkErr && <p className="text-red-600 text-sm bg-red-50 border border-red-100 rounded-lg px-3 py-2">{bulkErr}</p>}
            {bulkMsg && <p className="text-emerald-700 text-sm bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">{bulkMsg}</p>}
          </div>
        )}
        <div className="flex flex-col gap-2 mt-4">
          {teachers.map((t) => (
            <div key={t.id} className="row-card">
              <div className="sm:flex sm:items-start sm:justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 text-sm flex items-center gap-2 flex-wrap">
                    <input type="checkbox" checked={!!bulkIds[t.id]} onChange={() => toggleTeacher(t.id)} />
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
                  <Picker classes={classes} selected={managingSelected} onChange={setManagingSelected} />
                  {managingError && (
                    <p className="text-red-600 text-sm bg-red-50 border border-red-100 rounded-lg px-3 py-2">{managingError}</p>
                  )}
                  <div className="flex gap-2">
                    <button className="btn-primary btn-sm px-5" disabled={managingSaving} onClick={saveManage}>
                      {managingSaving ? "Saving…" : `Save assignments (+${diffFor(t).added} / −${diffFor(t).removed})`}
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