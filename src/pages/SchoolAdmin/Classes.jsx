import { useEffect, useState } from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query } from "firebase/firestore";
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

  return (
    <div className="flex flex-col gap-8 max-w-3xl">
      <div>
        <h3 className="text-lg font-semibold mb-3">Add a class</h3>
        <form onSubmit={createClass} className="flex flex-col gap-3 border rounded p-4">
          <div className="flex gap-3">
            <input
              className="border p-2 rounded flex-1"
              placeholder='Class name (e.g. "JSS 1", "SS 2 Science")'
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <select className="border p-2 rounded" value={level} onChange={(e) => setLevel(e.target.value)}>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            {isSenior && (
              <select className="border p-2 rounded" value={stream} onChange={(e) => setStream(e.target.value)}>
                <option value="">Stream…</option>
                {STREAMS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="text-sm font-medium">Subjects</label>
            <div className="flex gap-2 mt-1">
              <input
                className="border p-2 rounded flex-1"
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
              <button type="button" className="border px-3 rounded" onClick={addSubject}>
                Add
              </button>
            </div>
            {subjects.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {subjects.map((s) => (
                  <span key={s.id} className="bg-slate-100 rounded-full px-3 py-1 text-sm flex items-center gap-2">
                    {s.name}
                    <button type="button" className="text-slate-400" onClick={() => removeSubject(s.id)}>
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button className="bg-slate-900 text-white p-2 rounded disabled:opacity-50 self-start px-4" disabled={saving}>
            {saving ? "Saving…" : "Create class"}
          </button>
        </form>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-3">Classes ({classes.length})</h3>
        <div className="flex flex-col gap-2">
          {classes.map((c) => (
            <div key={c.id} className="border rounded p-3 flex items-center justify-between text-sm">
              <div>
                <span className="font-medium">{c.name}</span>{" "}
                <span className="text-slate-400">
                  {c.level}
                  {c.stream ? ` · ${c.stream}` : ""} · {c.subjects?.length || 0} subjects
                </span>
              </div>
              <button className="text-red-600" onClick={() => removeClass(c.id)}>
                Delete
              </button>
            </div>
          ))}
          {classes.length === 0 && <p className="text-slate-400 text-sm">No classes yet.</p>}
        </div>
      </div>
    </div>
  );
}
