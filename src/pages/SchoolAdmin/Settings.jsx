import { useEffect, useState } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase/config";
import ImageUpload from "../../components/ImageUpload";

const TERMS = ["First", "Second", "Third"];

export default function Settings({ schoolId }) {
  const [school, setSchool] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

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
          <ImageUpload label="School logo" currentUrl={school.logoUrl} onUploaded={(url) => setSchool({ ...school, logoUrl: url })} />
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
