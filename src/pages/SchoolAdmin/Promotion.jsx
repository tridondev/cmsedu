import { useEffect, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../../firebase/config";

const GRADUATE = "__GRADUATE__";
const NONE = "";

/**
 * Runs once a year, at the start of a new academic session: moves every
 * class's roster to whichever class the admin says they're promoted into
 * (e.g. JSS1 -> JSS2, SS1 Science -> SS2 Science), or marks them graduated
 * if they've finished (typically SS3).
 *
 * Students keep the SAME document id when they move — only the class they
 * live under changes — so any historical result docs (which are keyed by
 * student id, not by which class they're currently in) stay fully intact
 * and exportable under their old class+term, even after promotion.
 * "Graduating" students are kept (not deleted) with `graduated: true` so
 * their history remains exportable too; Students.jsx just hides them from
 * the active roster by default.
 */
export default function Promotion({ schoolId }) {
  const [classes, setClasses] = useState([]);
  const [studentCounts, setStudentCounts] = useState({});
  const [mapping, setMapping] = useState({}); // classId -> targetClassId | GRADUATE | NONE
  const [school, setSchool] = useState(null);
  const [newSession, setNewSession] = useState("");
  const [savingMap, setSavingMap] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    getDoc(doc(db, "schools", schoolId)).then((snap) => {
      if (snap.exists()) setSchool(snap.data());
    });
  }, [schoolId]);

  useEffect(() => {
    const q = query(collection(db, "schools", schoolId, "classes"), orderBy("name"));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setClasses(list);
      setMapping((prev) => {
        const next = { ...prev };
        list.forEach((c) => {
          if (!(c.id in next)) next[c.id] = c.promotesToClassId || NONE;
        });
        return next;
      });
    });
  }, [schoolId]);

  useEffect(() => {
    (async () => {
      const counts = {};
      await Promise.all(
        classes.map(async (c) => {
          const snap = await getDocs(collection(db, "schools", schoolId, "classes", c.id, "students"));
          counts[c.id] = snap.docs.filter((d) => !d.data().graduated).length;
        })
      );
      setStudentCounts(counts);
    })();
  }, [classes, schoolId]);

  const setClassMapping = (classId, value) => setMapping((prev) => ({ ...prev, [classId]: value }));

  const saveMapping = async () => {
    setSavingMap(true);
    try {
      await Promise.all(
        classes.map((c) =>
          updateDoc(doc(db, "schools", schoolId, "classes", c.id), {
            promotesToClassId: mapping[c.id] || null,
          })
        )
      );
    } finally {
      setSavingMap(false);
    }
  };

  const runPromotion = async () => {
    setConfirmOpen(false);
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      await saveMapping(); // persist the mapping for next year too

      const summary = [];
      for (const c of classes) {
        const target = mapping[c.id];
        if (!target) continue; // NONE — leave this class untouched

        const studentsSnap = await getDocs(collection(db, "schools", schoolId, "classes", c.id, "students"));
        const activeStudents = studentsSnap.docs.filter((d) => !d.data().graduated);
        if (activeStudents.length === 0) continue;

        let batch = writeBatch(db);
        let opsInBatch = 0;
        let count = 0;

        for (const studentDoc of activeStudents) {
          const data = studentDoc.data();
          if (target === GRADUATE) {
            batch.set(doc(db, "schools", schoolId, "classes", c.id, "students", studentDoc.id), { graduated: true, graduatedAt: Date.now() }, { merge: true });
            opsInBatch++;
          } else {
            // Same document id at the new class, so historical results
            // (keyed by student id) stay linked to the same student.
            batch.set(doc(db, "schools", schoolId, "classes", target, "students", studentDoc.id), {
              ...data,
              graduated: false,
              promotedFrom: c.id,
              promotedAt: Date.now(),
            });
            batch.delete(doc(db, "schools", schoolId, "classes", c.id, "students", studentDoc.id));
            opsInBatch += 2;
          }
          count++;

          if (opsInBatch >= 400) {
            await batch.commit();
            batch = writeBatch(db);
            opsInBatch = 0;
          }
        }
        if (opsInBatch > 0) await batch.commit();

        const targetName = target === GRADUATE ? "Graduated" : classes.find((k) => k.id === target)?.name || target;
        summary.push({ from: c.name, to: targetName, count });
      }

      if (newSession.trim()) {
        await updateDoc(doc(db, "schools", schoolId), { currentSession: newSession.trim(), currentTerm: "First" });
      }

      setResult(summary);
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  };

  const totalMoving = classes.reduce((n, c) => (mapping[c.id] ? n + (studentCounts[c.id] || 0) : n), 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="page-title">New Session &amp; Promotion</h2>
        <p className="page-subtitle">
          Map each class to where its students move next session, then run the migration once. Students keep
          their full result history under their old class — this only changes which class they're currently in.
        </p>
      </div>

      <div className="card-pad flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex-1">
          <label className="field-label">New academic session (optional)</label>
          <input
            className="input"
            placeholder={`e.g. ${nextSessionGuess(school?.currentSession)}`}
            value={newSession}
            onChange={(e) => setNewSession(e.target.value)}
          />
          <p className="text-xs text-slate-400 mt-1">
            Current: <b>{school?.currentSession || "not set"}</b>. Leave blank to only move students without
            changing the session — you can set it later in Settings.
          </p>
        </div>
        <button className="btn-secondary" disabled={savingMap} onClick={saveMapping}>
          {savingMap ? "Saving…" : "Save mapping for next year"}
        </button>
      </div>

      <div className="table-wrap hidden sm:block">
        <table className="table-modern">
          <thead>
            <tr>
              <th>Class</th>
              <th className="text-center">Students</th>
              <th>Promotes to</th>
            </tr>
          </thead>
          <tbody>
            {classes.map((c) => (
              <tr key={c.id}>
                <td className="font-medium text-slate-800">
                  {c.name} <span className="text-slate-400 text-xs">{c.level}{c.stream ? ` · ${c.stream}` : ""}</span>
                </td>
                <td className="text-center">{studentCounts[c.id] ?? "…"}</td>
                <td>
                  <select className="input" value={mapping[c.id] || NONE} onChange={(e) => setClassMapping(c.id, e.target.value)}>
                    <option value={NONE}>— No change / do not promote —</option>
                    <option value={GRADUATE}>Graduating (leave school)</option>
                    {classes
                      .filter((k) => k.id !== c.id)
                      .map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.name}
                        </option>
                      ))}
                  </select>
                </td>
              </tr>
            ))}
            {classes.length === 0 && (
              <tr>
                <td colSpan={3} className="p-6 text-center text-slate-400">
                  No classes yet — set those up first.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden flex flex-col gap-3">
        {classes.map((c) => (
          <div key={c.id} className="row-card">
            <p className="font-medium text-slate-800 text-sm">
              {c.name} <span className="text-slate-400 text-xs">· {studentCounts[c.id] ?? "…"} students</span>
            </p>
            <select className="input mt-2" value={mapping[c.id] || NONE} onChange={(e) => setClassMapping(c.id, e.target.value)}>
              <option value={NONE}>— No change / do not promote —</option>
              <option value={GRADUATE}>Graduating (leave school)</option>
              {classes
                .filter((k) => k.id !== c.id)
                .map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
            </select>
          </div>
        ))}
      </div>

      {error && <p className="text-red-600 text-sm bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}

      {result && (
        <div className="card-pad bg-emerald-50 border border-emerald-100">
          <p className="text-sm font-medium text-emerald-900 mb-2">Promotion complete:</p>
          <ul className="text-sm text-emerald-800 flex flex-col gap-1">
            {result.map((r, i) => (
              <li key={i}>
                {r.count} student{r.count === 1 ? "" : "s"} moved from <b>{r.from}</b> → <b>{r.to}</b>
              </li>
            ))}
            {result.length === 0 && <li>No classes had a mapping set — nothing was moved.</li>}
          </ul>
        </div>
      )}

      <div className="card-pad bg-amber-50 border border-amber-100 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-900">Ready to run?</p>
          <p className="text-xs text-amber-700">
            This will move {totalMoving} student{totalMoving === 1 ? "" : "s"} across {classes.filter((c) => mapping[c.id]).length}{" "}
            class{classes.filter((c) => mapping[c.id]).length === 1 ? "" : "es"} right now. New students for the
            upcoming session (e.g. a fresh JSS1 intake) can still be added afterward in the Students tab as normal.
          </p>
        </div>
        <button className="btn-primary" disabled={running || totalMoving === 0} onClick={() => setConfirmOpen(true)}>
          {running ? "Running…" : "Run promotion now"}
        </button>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <h3 className="font-semibold text-slate-900 mb-2">Confirm promotion</h3>
            <p className="text-sm text-slate-600 mb-4">
              This moves {totalMoving} student{totalMoving === 1 ? "" : "s"} to their mapped classes right now.
              This can't be undone automatically — double check the mapping table above before continuing.
            </p>
            <div className="flex gap-2 justify-end">
              <button className="btn-secondary" onClick={() => setConfirmOpen(false)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={runPromotion}>
                Yes, run promotion
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function nextSessionGuess(current) {
  const match = String(current || "").match(/(\d{4})\D+(\d{4})/);
  if (!match) return "2026/2027";
  const y1 = parseInt(match[1], 10) + 1;
  const y2 = parseInt(match[2], 10) + 1;
  return `${y1}/${y2}`;
}
