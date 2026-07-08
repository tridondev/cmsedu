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
    <div className="flex flex-col gap-8">
      <div>
        <label className="field-label">Class</label>
        <select className="input max-w-xs" value={classId} onChange={(e) => setClassId(e.target.value)}>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {classes.length === 0 && <p className="text-amber-600 text-sm mt-2">No classes yet — create one in the Classes tab first.</p>}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div>
          <h3 className="page-title">Add one student</h3>
          <form onSubmit={addStudent} className="card-pad flex flex-col gap-3 mt-3">
            <div>
              <label className="field-label">Full name</label>
              <input className="input" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label">Exam No.</label>
                <input className="input" value={form.examNo} onChange={(e) => setForm({ ...form, examNo: e.target.value })} />
              </div>
              <div>
                <label className="field-label">Sex</label>
                <select className="input" value={form.sex} onChange={(e) => setForm({ ...form, sex: e.target.value })}>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label">State of Origin</label>
                <input className="input" value={form.stateOfOrigin} onChange={(e) => setForm({ ...form, stateOfOrigin: e.target.value })} />
              </div>
              <div>
                <label className="field-label">LGA</label>
                <input className="input" value={form.lga} onChange={(e) => setForm({ ...form, lga: e.target.value })} />
              </div>
            </div>
            <button className="btn-primary" disabled={saving}>
              Add student
            </button>
          </form>
        </div>

        <div>
          <h3 className="page-title">Bulk add</h3>
          <div className="card-pad flex flex-col gap-3 mt-3">
            <p className="text-xs text-slate-500">
              One student per line: <code className="bg-slate-100 rounded px-1 py-0.5">Name, ExamNo, Sex, State, LGA</code> — only Name is required.
            </p>
            <textarea
              className="textarea h-32"
              placeholder={"Dakup Nendunu, OO1, MALE, Plateau, Kanke\nJonah God'scare, OO2, MALE, Plateau, Jos"}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
            />
            <button className="btn-primary self-start px-6" disabled={saving} onClick={bulkAdd}>
              {saving ? "Adding…" : "Add all"}
            </button>
          </div>
        </div>
      </div>

      {error && <p className="text-red-600 text-sm bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}

      <div>
        <h3 className="page-title">Roster ({students.length})</h3>

        <div className="hidden sm:block table-wrap mt-4">
          <table className="table-modern">
            <thead>
              <tr>
                <th>Name</th>
                <th>Exam No.</th>
                <th>Sex</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id}>
                  <td className="font-medium text-slate-800">{s.fullName}</td>
                  <td className="text-slate-500">{s.examNo || "—"}</td>
                  <td className="text-slate-500">{s.sex}</td>
                  <td className="text-right">
                    <button className="btn-sm btn-danger" onClick={() => removeStudent(s.id)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {students.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-slate-400">
                    No students in this class yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="sm:hidden flex flex-col gap-2 mt-4">
          {students.map((s) => (
            <div key={s.id} className="row-card flex-row items-center justify-between">
              <div>
                <p className="font-medium text-slate-800 text-sm">{s.fullName}</p>
                <p className="text-slate-400 text-xs mt-0.5">{s.examNo || "no exam no."} · {s.sex}</p>
              </div>
              <button className="btn-sm btn-danger" onClick={() => removeStudent(s.id)}>
                Remove
              </button>
            </div>
          ))}
          {students.length === 0 && <div className="card-pad text-center text-slate-400 text-sm">No students in this class yet.</div>}
        </div>
      </div>
    </div>
  );
}
