import { useEffect, useState } from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "../../firebase/config";

export default function Students({ schoolId }) {
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState("");
  const [students, setStudents] = useState([]);
  const [showGraduated, setShowGraduated] = useState(false);
  const [form, setForm] = useState({ fullName: "", examNo: "", sex: "MALE", stateOfOrigin: "", lga: "" });
  const [bulkText, setBulkText] = useState("");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState({}); // studentId -> true
  const [moveTarget, setMoveTarget] = useState("");
  const [moving, setMoving] = useState(false);
  const [moveMsg, setMoveMsg] = useState(null);
  const [editing, setEditing] = useState(null); // student being edited
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState(null);

  useEffect(() => {
    const q = query(collection(db, "schools", schoolId, "classes"), orderBy("name"));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setClasses(list);
      if (!classId && list.length) setClassId(list[0].id);
    });
  }, [schoolId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setSelected({});
    setMoveMsg(null);
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

  const startEdit = (s) => {
    setEditError(null);
    setEditing({
      id: s.id,
      fullName: s.fullName || "",
      examNo: s.examNo || "",
      sex: s.sex || "MALE",
      stateOfOrigin: s.stateOfOrigin || "",
      lga: s.lga || "",
    });
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    setEditError(null);
    if (!editing.fullName.trim()) return setEditError("Name is required");
    setEditSaving(true);
    try {
      // Only the details change; the document id stays the same so all
      // existing scores and results remain linked to this student.
      await updateDoc(doc(db, "schools", schoolId, "classes", classId, "students", editing.id), {
        fullName: editing.fullName.trim(),
        examNo: editing.examNo.trim(),
        sex: editing.sex,
        stateOfOrigin: editing.stateOfOrigin.trim(),
        lga: editing.lga.trim(),
        updatedAt: Date.now(),
      });
      setEditing(null);
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditSaving(false);
    }
  };

  const visibleStudents = showGraduated ? students : students.filter((s) => !s.graduated);

  const selectedIds = visibleStudents.filter((s) => selected[s.id]).map((s) => s.id);
  const allSelected = visibleStudents.length > 0 && selectedIds.length === visibleStudents.length;
  const toggleOne = (id) => setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  const toggleAll = () => {
    if (allSelected) return setSelected({});
    const next = {};
    visibleStudents.forEach((s) => (next[s.id] = true));
    setSelected(next);
  };

  // Move the ticked students to another class. Same document id is kept so
  // their existing results stay linked to them.
  const moveSelected = async () => {
    setError(null);
    setMoveMsg(null);
    if (!moveTarget) return setError("Choose the class to move them to");
    if (!selectedIds.length) return;
    const sameClass = moveTarget === classId;
    if (sameClass && selectedIds.some((id) => !students.find((x) => x.id === id)?.graduated)) {
      return setError("Those students are already active in this class. Pick a different class, or select only graduated students to restore them here.");
    }
    const targetName = classes.find((c) => c.id === moveTarget)?.name || "that class";
    const verb = sameClass ? "Restore" : "Move";
    if (!confirm(`${verb} ${selectedIds.length} student${selectedIds.length === 1 ? "" : "s"} ${sameClass ? "as active in" : "to"} ${targetName}?`)) return;
    setMoving(true);
    try {
      let batch = writeBatch(db);
      let ops = 0;
      for (const id of selectedIds) {
        const s = students.find((x) => x.id === id);
        if (!s) continue;
        const { id: _omit, ...data } = s;
        if (sameClass) {
          // Wrongly graduated: just make them active again in the same class.
          batch.set(doc(db, "schools", schoolId, "classes", classId, "students", id), { graduated: false, graduatedAt: null }, { merge: true });
          ops += 1;
        } else {
          batch.set(doc(db, "schools", schoolId, "classes", moveTarget, "students", id), {
            ...data,
            graduated: false,
            promotedFrom: classId,
            promotedAt: Date.now(),
          });
          batch.delete(doc(db, "schools", schoolId, "classes", classId, "students", id));
          ops += 2;
        }
        if (ops >= 400) {
          await batch.commit();
          batch = writeBatch(db);
          ops = 0;
        }
      }
      if (ops > 0) await batch.commit();
      setSelected({});
      setMoveMsg(`${sameClass ? "Restored" : "Moved"} ${selectedIds.length} student${selectedIds.length === 1 ? "" : "s"} ${sameClass ? "in" : "to"} ${targetName}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setMoving(false);
    }
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
        <div className="flex items-center justify-between">
          <h3 className="page-title">Roster ({visibleStudents.length})</h3>
          <label className="text-xs text-slate-500 inline-flex items-center gap-1.5">
            <input type="checkbox" checked={showGraduated} onChange={(e) => setShowGraduated(e.target.checked)} />
            Show graduated/promoted-out students
          </label>
        </div>


        {visibleStudents.length > 0 && (
          <div className="card-pad mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <label className="text-sm text-slate-600 inline-flex items-center gap-2">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} />
              Select all ({selectedIds.length} selected)
            </label>
            <select className="input sm:max-w-xs sm:ml-auto" value={moveTarget} onChange={(e) => setMoveTarget(e.target.value)}>
              <option value="">Move selected to…</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.id === classId ? `${c.name} (restore graduated here)` : c.name}</option>
              ))}
            </select>
            <button className="btn-primary" disabled={moving || !selectedIds.length || !moveTarget} onClick={moveSelected}>
              {moving ? "Moving…" : "Move"}
            </button>
          </div>
        )}
        {moveMsg && <p className="text-emerald-700 text-sm bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 mt-3">{moveMsg}</p>}

        <div className="hidden sm:block table-wrap mt-4">
          <table className="table-modern">
            <thead>
              <tr>
                <th className="w-8"></th>
                <th>Name</th>
                <th>Exam No.</th>
                <th>Sex</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleStudents.map((s) => (
                <tr key={s.id}>
                  <td><input type="checkbox" checked={!!selected[s.id]} onChange={() => toggleOne(s.id)} /></td>
                  <td className="font-medium text-slate-800">
                    {s.fullName} {s.graduated && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 align-middle">Graduated</span>}
                  </td>
                  <td className="text-slate-500">{s.examNo || "—"}</td>
                  <td className="text-slate-500">{s.sex}</td>
                  <td className="text-right whitespace-nowrap">
                    <button className="btn-sm btn-secondary mr-2" onClick={() => startEdit(s)}>
                      Edit
                    </button>
                    <button className="btn-sm btn-danger" onClick={() => removeStudent(s.id)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {visibleStudents.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-slate-400">
                    No students in this class yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="sm:hidden flex flex-col gap-2 mt-4">
          {visibleStudents.map((s) => (
            <div key={s.id} className="row-card flex-row items-center justify-between">
              <input type="checkbox" className="mr-3" checked={!!selected[s.id]} onChange={() => toggleOne(s.id)} />
              <div className="flex-1">
                <p className="font-medium text-slate-800 text-sm">
                  {s.fullName} {s.graduated && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 align-middle">Graduated</span>}
                </p>
                <p className="text-slate-400 text-xs mt-0.5">{s.examNo || "no exam no."} · {s.sex}</p>
              </div>
              <div className="flex gap-2">
                <button className="btn-sm btn-secondary" onClick={() => startEdit(s)}>
                  Edit
                </button>
                <button className="btn-sm btn-danger" onClick={() => removeStudent(s.id)}>
                  Remove
                </button>
              </div>
            </div>
          ))}
          {visibleStudents.length === 0 && <div className="card-pad text-center text-slate-400 text-sm">No students in this class yet.</div>}
        </div>
      </div>
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !editSaving && setEditing(null)}>
          <form onSubmit={saveEdit} onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 flex flex-col gap-3">
            <h3 className="page-title">Edit student</h3>
            <div>
              <label className="field-label">Full name</label>
              <input className="input" value={editing.fullName} onChange={(e) => setEditing({ ...editing, fullName: e.target.value })} autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label">Exam No.</label>
                <input className="input" value={editing.examNo} onChange={(e) => setEditing({ ...editing, examNo: e.target.value })} />
              </div>
              <div>
                <label className="field-label">Sex</label>
                <select className="input" value={editing.sex} onChange={(e) => setEditing({ ...editing, sex: e.target.value })}>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label">State of Origin</label>
                <input className="input" value={editing.stateOfOrigin} onChange={(e) => setEditing({ ...editing, stateOfOrigin: e.target.value })} />
              </div>
              <div>
                <label className="field-label">LGA</label>
                <input className="input" value={editing.lga} onChange={(e) => setEditing({ ...editing, lga: e.target.value })} />
              </div>
            </div>
            {editError && <p className="text-red-600 text-sm bg-red-50 border border-red-100 rounded-lg px-3 py-2">{editError}</p>}
            <div className="flex justify-end gap-2 mt-1">
              <button type="button" className="btn-secondary" disabled={editSaving} onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button className="btn-primary" disabled={editSaving}>
                {editSaving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
