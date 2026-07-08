import { useEffect, useState } from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, writeBatch } from "firebase/firestore";
import { db } from "../../firebase/config";

export default function Students({ schoolId }) {
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState("");
  const [students, setStudents] = useState([]);
  const [form, setForm] = useState({ fullName: "", examNo: "", sex: "MALE", stateOfOrigin: "", lga: "" });
  const [bulkText, setBulkText] = useState("");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "schools", schoolId, "classes"), orderBy("name"));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setClasses(list);
      if (!classId && list.length) setClassId(list[0].id);
    });
  }, [schoolId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!classId) return setStudents([]);
    const q = query(collection(db, "schools", schoolId, "classes", classId, "students"), orderBy("fullName"));
    return onSnapshot(q, (snap) => setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
  }, [schoolId, classId]);

  const addStudent = async (e) => {
    e.preventDefault();
    setError(null);
    if (!form.fullName.trim()) return setError("Name is required");
    if (!classId) return setError("Create a class first");
    setSaving(true);
    try {
      await addDoc(collection(db, "schools", schoolId, "classes", classId, "students"), {
        ...form,
        fullName: form.fullName.trim(),
        createdAt: Date.now(),
      });
      setForm({ fullName: "", examNo: "", sex: "MALE", stateOfOrigin: "", lga: "" });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const removeStudent = async (studentId) => {
    if (!confirm("Remove this student?")) return;
    await deleteDoc(doc(db, "schools", schoolId, "classes", classId, "students", studentId));
  };

  const bulkAdd = async () => {
    setError(null);
    const lines = bulkText.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;
    if (!classId) return setError("Create a class first");
    setSaving(true);
    try {
      const batch = writeBatch(db);
      const colRef = collection(db, "schools", schoolId, "classes", classId, "students");
      for (const line of lines) {
        const [fullName, examNo, sex, stateOfOrigin, lga] = line.split(",").map((v) => (v || "").trim());
        if (!fullName) continue;
        const ref = doc(colRef);
        batch.set(ref, {
          fullName,
          examNo: examNo || "",
          sex: sex || "MALE",
          stateOfOrigin: stateOfOrigin || "",
          lga: lga || "",
          createdAt: Date.now(),
        });
      }
      await batch.commit();
      setBulkText("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-8 max-w-3xl">
      <div>
        <label className="text-sm font-medium">Class</label>
        <select className="border p-2 rounded w-full mt-1" value={classId} onChange={(e) => setClassId(e.target.value)}>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {classes.length === 0 && <p className="text-amber-600 text-sm mt-1">No classes yet — create one in the Classes tab first.</p>}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h3 className="text-lg font-semibold mb-3">Add one student</h3>
          <form onSubmit={addStudent} className="flex flex-col gap-2 border rounded p-4">
            <input className="border p-2 rounded" placeholder="Full name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
            <input className="border p-2 rounded" placeholder="Exam No." value={form.examNo} onChange={(e) => setForm({ ...form, examNo: e.target.value })} />
            <select className="border p-2 rounded" value={form.sex} onChange={(e) => setForm({ ...form, sex: e.target.value })}>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
            </select>
            <input className="border p-2 rounded" placeholder="State of Origin" value={form.stateOfOrigin} onChange={(e) => setForm({ ...form, stateOfOrigin: e.target.value })} />
            <input className="border p-2 rounded" placeholder="LGA" value={form.lga} onChange={(e) => setForm({ ...form, lga: e.target.value })} />
            <button className="bg-slate-900 text-white p-2 rounded disabled:opacity-50" disabled={saving}>
              Add student
            </button>
          </form>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-3">Bulk add</h3>
          <div className="border rounded p-4 flex flex-col gap-2">
            <p className="text-xs text-slate-500">
              One student per line: <code>Name, ExamNo, Sex, State, LGA</code> — only Name is required.
            </p>
            <textarea
              className="border p-2 rounded h-32 font-mono text-sm"
              placeholder={"Dakup Nendunu, OO1, MALE, Plateau, Kanke\nJonah God'scare, OO2, MALE, Plateau, Jos"}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
            />
            <button className="bg-slate-900 text-white p-2 rounded disabled:opacity-50 self-start px-4" disabled={saving} onClick={bulkAdd}>
              {saving ? "Adding…" : "Add all"}
            </button>
          </div>
        </div>
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <div>
        <h3 className="text-lg font-semibold mb-3">Roster ({students.length})</h3>
        <div className="flex flex-col gap-1">
          {students.map((s) => (
            <div key={s.id} className="border rounded p-2 flex items-center justify-between text-sm">
              <span>
                {s.fullName} <span className="text-slate-400">· {s.examNo || "no exam no."} · {s.sex}</span>
              </span>
              <button className="text-red-600" onClick={() => removeStudent(s.id)}>
                Remove
              </button>
            </div>
          ))}
          {students.length === 0 && <p className="text-slate-400 text-sm">No students in this class yet.</p>}
        </div>
      </div>
    </div>
  );
}
