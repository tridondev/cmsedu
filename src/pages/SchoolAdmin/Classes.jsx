import { useEffect, useState } from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, updateDoc } from "firebase/firestore";
import { db } from "../../firebase/config";

const LEVELS = ["JSS1", "JSS2", "JSS3", "SS1", "SS2", "SS3"];
const STREAMS = ["Science", "Art", "Commercial"];

export default function Classes({ schoolId }) {
  const [classes, setClasses] = useState([]);
  const [name, setName] = useState("");
  const [level, setLevel] = useState("JSS1");
  const [stream, setStream] = useState("");
  const [subjectDraft, setSubjectDraft] = useState("");
  const [subjects, setSubjects] = useState([]);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Editing subjects on an already-created class
  const [editingClassId, setEditingClassId] = useState(null);
  const [editSubjects, setEditSubjects] = useState([]);
  const [editSubjectDraft, setEditSubjectDraft] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState(null);

  const isSenior = level.startsWith("SS");

  useEffect(() => {
    const q = query(collection(db, "schools", schoolId, "classes"), orderBy("name"));
    return onSnapshot(q, (snap) => setClasses(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
  }, [schoolId]);

  const addSubject = () => {
    const trimmed = subjectDraft.trim();
    if (!trimmed) return;
    const id = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    if (subjects.some((s) => s.id === id)) return;
    setSubjects([...subjects, { id, name: trimmed }]);
    setSubjectDraft("");
  };

  const removeSubject = (id) => setSubjects(subjects.filter((s) => s.id !== id));

  const createClass = async (e) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Class name is required");
    if (subjects.length === 0) return setError("Add at least one subject");
    setSaving(true);
    try {
      await addDoc(collection(db, "schools", schoolId, "classes"), {
        name: name.trim(),
        level,
        stream: isSenior ? stream || null : null,
        subjects,
        createdAt: Date.now(),
      });
      setName("");
      setStream("");
      setSubjects([]);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const removeClass = async (classId) => {
    if (!confirm("Delete this class? Students and results under it will remain in the database but be unreachable from the UI.")) return;
    await deleteDoc(doc(db, "schools", schoolId, "classes", classId));
  };

  const startEditSubjects = (cls) => {
    setEditingClassId(cls.id);
    setEditSubjects(cls.subjects || []);
    setEditSubjectDraft("");
    setEditError(null);
  };

  const cancelEditSubjects = () => {
    setEditingClassId(null);
    setEditSubjects([]);
    setEditSubjectDraft("");
    setEditError(null);
  };

  const addEditSubject = () => {
    const trimmed = editSubjectDraft.trim();
    if (!trimmed) return;
    const id = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    if (editSubjects.some((s) => s.id === id)) return;
    setEditSubjects([...editSubjects, { id, name: trimmed }]);
    setEditSubjectDraft("");
  };

  const removeEditSubject = (id) => setEditSubjects(editSubjects.filter((s) => s.id !== id));

  const saveEditSubjects = async () => {
    if (editSubjects.length === 0) return setEditError("A class needs at least one subject");
    setEditSaving(true);
    setEditError(null);
    try {
      await updateDoc(doc(db, "schools", schoolId, "classes", editingClassId), { subjects: editSubjects });
      cancelEditSubjects();
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h3 className="page-title">Add a class</h3>
        <p className="page-subtitle mb-4">Define the level, optional stream, and subjects taught.</p>
        <form onSubmit={createClass} className="card-pad flex flex-col gap-4 max-w-2xl">
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1">
              <label className="field-label">Class name</label>
              <input
                className="input"
                placeholder='e.g. "SS 2 Science"'
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="field-label">Level</label>
              <select className="input" value={level} onChange={(e) => setLevel(e.target.value)}>
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            {isSenior && (
              <div>
                <label className="field-label">Stream</label>
                <select className="input" value={stream} onChange={(e) => setStream(e.target.value)}>
                  <option value="">Stream…</option>
                  {STREAMS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div>
            <label className="field-label">Subjects</label>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder="Subject name, then Enter"
                value={subjectDraft}
                onChange={(e) => setSubjectDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSubject();
                  }
                }}
              />
              <button type="button" className="btn-secondary shrink-0" onClick={addSubject}>
                Add
              </button>
            </div>
            {subjects.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {subjects.map((s) => (
                  <span key={s.id} className="badge-brand pr-1.5">
                    {s.name}
                    <button
                      type="button"
                      className="h-4 w-4 rounded-full bg-brand-100 hover:bg-brand-200 text-brand-700 flex items-center justify-center text-xs"
                      onClick={() => removeSubject(s.id)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-red-600 text-sm bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
          <button className="btn-primary self-start px-6" disabled={saving}>
            {saving ? "Saving…" : "Create class"}
          </button>
        </form>
      </div>

      <div>
        <h3 className="page-title">Classes ({classes.length})</h3>
        <div className="flex flex-col gap-2 mt-4">
          {classes.map((c) => (
            <div key={c.id} className="row-card">
              <div className="sm:flex sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-slate-900 text-sm">{c.name}</p>
                  <p className="text-slate-400 text-xs mt-0.5">
                    {c.level}
                    {c.stream ? ` · ${c.stream}` : ""} · {c.subjects?.length || 0} subjects
                  </p>
                </div>
                <div className="flex gap-2 mt-2 sm:mt-0">
                  <button
                    className="btn-sm btn-secondary"
                    onClick={() => (editingClassId === c.id ? cancelEditSubjects() : startEditSubjects(c))}
                  >
                    {editingClassId === c.id ? "Cancel" : "Edit subjects"}
                  </button>
                  <button className="btn-sm btn-danger" onClick={() => removeClass(c.id)}>
                    Delete
                  </button>
                </div>
              </div>

              {editingClassId === c.id && (
                <div className="mt-3 pt-3 border-t border-slate-100 flex flex-col gap-3">
                  <div>
                    <label className="field-label">Subjects for {c.name}</label>
                    <div className="flex flex-wrap gap-2">
                      {editSubjects.map((s) => (
                        <span key={s.id} className="badge-brand pr-1.5">
                          {s.name}
                          <button
                            type="button"
                            className="h-4 w-4 rounded-full bg-brand-100 hover:bg-brand-200 text-brand-700 flex items-center justify-center text-xs"
                            onClick={() => removeEditSubject(s.id)}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      {editSubjects.length === 0 && <span className="text-slate-400 text-xs">No subjects yet.</span>}
                    </div>
                  </div>
                  <div className="flex gap-2 max-w-md">
                    <input
                      className="input flex-1"
                      placeholder="Add a subject, then Enter"
                      value={editSubjectDraft}
                      onChange={(e) => setEditSubjectDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addEditSubject();
                        }
                      }}
                    />
                    <button type="button" className="btn-secondary shrink-0" onClick={addEditSubject}>
                      Add
                    </button>
                  </div>
                  {editError && <p className="text-red-600 text-sm bg-red-50 border border-red-100 rounded-lg px-3 py-2">{editError}</p>}
                  <div className="flex gap-2">
                    <button className="btn-primary btn-sm px-5" disabled={editSaving} onClick={saveEditSubjects}>
                      {editSaving ? "Saving…" : "Save changes"}
                    </button>
                    <button className="btn-ghost btn-sm" onClick={cancelEditSubjects}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {classes.length === 0 && <div className="card-pad text-center text-slate-400 text-sm">No classes yet.</div>}
        </div>
      </div>
    </div>
  );
}
