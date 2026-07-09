import { useEffect, useState } from "react";
import { doc, getDoc, updateDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase/config";
import ImageUpload from "../../components/ImageUpload";
import { WEIGHTS } from "../../lib/resultEngine";

const TERMS = ["First", "Second", "Third"];
const WEIGHT_FIELDS = [
  { key: "ca1", label: "CA1" },
  { key: "ca2", label: "CA2" },
  { key: "test1", label: "Test 1" },
  { key: "test2", label: "Test 2" },
  { key: "exam", label: "Exam" },
];

export default function Settings({ schoolId }) {
  const [school, setSchool] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const [newSession, setNewSession] = useState("");
  const [startingSession, setStartingSession] = useState(false);
  const [sessionMsg, setSessionMsg] = useState(null);

  useEffect(() => {
    getDoc(doc(db, "schools", schoolId)).then((snap) => {
      if (snap.exists()) setSchool({ id: snap.id, ...snap.data() });
    });
  }, [schoolId]);

  const field = (key) => ({
    value: school?.[key] || "",
    onChange: (e) => setSchool({ ...school, [key]: e.target.value }),
  });

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const { id, ...data } = school;
      await updateDoc(doc(db, "schools", schoolId), data);
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const startNewSession = async () => {
    const label = newSession.trim();
    if (!label) return;
    if (
      !confirm(
        `Start "${label}" as the new academic session? Teachers will begin entering fresh First Term scores under this session — nothing from "${school.currentSession || "the current session"}" will be changed or deleted.`
      )
    ) {
      return;
    }
    setStartingSession(true);
    setSessionMsg(null);
    setError(null);
    try {
      // Archive the outgoing session for a record of when each session ran,
      // then move the school forward to the new session at First Term.
      if (school.currentSession) {
        const archiveId = school.currentSession.replace(/[^a-zA-Z0-9]+/g, "-");
        await setDoc(doc(db, "schools", schoolId, "sessions", archiveId), {
          label: school.currentSession,
          endedAt: serverTimestamp(),
        });
      }
      await updateDoc(doc(db, "schools", schoolId), {
        currentSession: label,
        currentTerm: "First",
      });
      setSchool({ ...school, currentSession: label, currentTerm: "First" });
      setNewSession("");
      setSessionMsg(`Now on "${label}", First Term. Teachers will enter scores into this new session.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setStartingSession(false);
    }
  };

  if (!school) {
    return (
      <div className="flex flex-col gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card-pad h-24 animate-pulse bg-slate-100" />
        ))}
      </div>
    );
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-6 max-w-2xl">
      <div className="card-pad">
        <h3 className="page-title mb-4">School details</h3>
        <div className="flex flex-col gap-4">
          <div>
            <label className="field-label">School name</label>
            <input className="input" {...field("name")} />
          </div>
          <div>
            <label className="field-label">Address</label>
            <input className="input" {...field("address")} />
          </div>
          <div>
            <label className="field-label">Ministry / regulatory body</label>
            <input className="input" {...field("ministry")} />
          </div>
          <ImageUpload
            label="Federal Government logo (top-left of report card)"
            currentUrl={school.govLogoUrl}
            onUploaded={(url) => setSchool({ ...school, govLogoUrl: url })}
          />
          <ImageUpload
            label="School logo (top-right of report card)"
            currentUrl={school.logoUrl}
            onUploaded={(url) => setSchool({ ...school, logoUrl: url })}
          />
        </div>
      </div>

      <div className="card-pad">
        <h3 className="page-title mb-4">Current session & term</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="field-label">Session</label>
            <input className="input" placeholder="e.g. 2025/2026" {...field("currentSession")} />
          </div>
          <div>
            <label className="field-label">Term</label>
            <select className="input" value={school.currentTerm || "First"} onChange={(e) => setSchool({ ...school, currentTerm: e.target.value })}>
              {TERMS.map((t) => (
                <option key={t} value={t}>
                  {t} Term
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-3">
          This controls which term teachers enter scores into by default, and which term the Results tab previews
          first — students, past scores, and past exports for earlier terms aren't affected by changing this.
        </p>
      </div>

      <div className="card-pad">
        <h3 className="page-title mb-4">Score weighting</h3>
        <p className="page-subtitle mb-4">
          How much each component counts toward a subject's total, as a fraction (e.g. 0.1 = 10%). Each row should
          add up to 1. This is what teachers' score entry and the report card's total column use — leave a scale
          blank to keep the built-in default ({WEIGHT_FIELDS.map((f) => WEIGHTS.JSS[f.key]).join(" / ")} for
          Junior, {WEIGHT_FIELDS.map((f) => WEIGHTS.SS[f.key]).join(" / ")} for Senior).
        </p>
        <div className="grid sm:grid-cols-2 gap-6">
          {["JSS", "SS"].map((scale) => {
            const current = school.weights?.[scale] || {};
            const sum = WEIGHT_FIELDS.reduce((acc, f) => acc + Number(current[f.key] ?? WEIGHTS[scale][f.key]), 0);
            return (
              <div key={scale}>
                <p className="text-sm font-semibold text-slate-700 mb-2">{scale === "JSS" ? "Junior (JSS)" : "Senior (SS)"}</p>
                <div className="grid grid-cols-5 gap-2">
                  {WEIGHT_FIELDS.map((f) => (
                    <div key={f.key}>
                      <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{f.label}</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="1"
                        className="input py-1.5 text-center mt-0.5"
                        value={current[f.key] ?? WEIGHTS[scale][f.key]}
                        onChange={(e) =>
                          setSchool({
                            ...school,
                            weights: {
                              ...school.weights,
                              [scale]: { ...WEIGHTS[scale], ...current, [f.key]: Number(e.target.value) },
                            },
                          })
                        }
                      />
                    </div>
                  ))}
                </div>
                <p className={`text-xs mt-2 ${Math.abs(sum - 1) > 0.001 ? "text-amber-600" : "text-slate-400"}`}>
                  Adds up to {Math.round(sum * 100) / 100}
                  {Math.abs(sum - 1) > 0.001 ? " — should be 1" : ""}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card-pad">
        <h3 className="page-title mb-4">Academic session</h3>
        <p className="page-subtitle mb-3">
          Current session: <b className="text-slate-700">{school.currentSession || "—"}</b>
        </p>
        <p className="text-xs text-slate-500 mb-3">
          When this session is finished, start a new one below. Every score already entered stays exactly where it
          is — a new session simply gives teachers a clean slate to enter fresh scores into, starting at First
          Term.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
          <div className="flex-1">
            <label className="field-label">New session</label>
            <input
              className="input"
              placeholder="e.g. 2026/2027"
              value={newSession}
              onChange={(e) => setNewSession(e.target.value)}
            />
          </div>
          <button type="button" className="btn-secondary shrink-0" disabled={startingSession || !newSession.trim()} onClick={startNewSession}>
            {startingSession ? "Starting…" : "Start new academic session"}
          </button>
        </div>
        {sessionMsg && <p className="text-emerald-700 text-sm bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 mt-3">{sessionMsg}</p>}
      </div>

      <div className="card-pad">
        <h3 className="page-title mb-4">Signatures on the report card</h3>
        <div className="grid sm:grid-cols-2 gap-6">
          <div className="flex flex-col gap-3">
            <div>
              <label className="field-label">Principal's name</label>
              <input className="input" {...field("principalName")} />
            </div>
            <ImageUpload
              label="Principal's signature"
              currentUrl={school.principalSigUrl}
              onUploaded={(url) => setSchool({ ...school, principalSigUrl: url })}
            />
          </div>
          <div className="flex flex-col gap-3">
            <div>
              <label className="field-label">Default Form Master's name</label>
              <input className="input" {...field("formMasterDefaultName")} />
            </div>
            <ImageUpload
              label="Form Master's signature"
              currentUrl={school.formMasterSigUrl}
              onUploaded={(url) => setSchool({ ...school, formMasterSigUrl: url })}
            />
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-3">
          These are currently reference fields — wiring them into the exported image cells is a small follow-up in
          exportToExcel.js once you're ready for it.
        </p>
      </div>

      {error && <p className="text-red-600 text-sm bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
      {saved && <p className="text-emerald-700 text-sm bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">Saved.</p>}
      <button className="btn-primary self-start px-8" disabled={saving}>
        {saving ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
