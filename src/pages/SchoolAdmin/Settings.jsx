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

  if (!school) return <p className="text-slate-400">Loading…</p>;

  return (
    <form onSubmit={save} className="flex flex-col gap-8 max-w-2xl">
      <div>
        <h3 className="text-lg font-semibold mb-3">School details</h3>
        <div className="flex flex-col gap-3">
          <input className="border p-2 rounded" placeholder="School name" {...field("name")} />
          <input className="border p-2 rounded" placeholder="Address" {...field("address")} />
          <input className="border p-2 rounded" placeholder="Ministry / regulatory body" {...field("ministry")} />
          <ImageUpload
            label="School logo"
            currentUrl={school.logoUrl}
            onUploaded={(url) => setSchool({ ...school, logoUrl: url })}
          />
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-3">Current session & term</h3>
        <div className="flex gap-3">
          <input className="border p-2 rounded flex-1" placeholder="Session (e.g. 2025/2026)" {...field("currentSession")} />
          <select className="border p-2 rounded" value={school.currentTerm || "First"} onChange={(e) => setSchool({ ...school, currentTerm: e.target.value })}>
            {TERMS.map((t) => (
              <option key={t} value={t}>
                {t} Term
              </option>
            ))}
          </select>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          This controls which term teachers enter scores into by default, and which term the Results tab
          previews first — students, past scores, and past exports for earlier terms aren't affected by
          changing this.
        </p>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-3">Signatures on the report card</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-3">
            <input className="border p-2 rounded" placeholder="Principal's name" {...field("principalName")} />
            <ImageUpload
              label="Principal's signature"
              currentUrl={school.principalSigUrl}
              onUploaded={(url) => setSchool({ ...school, principalSigUrl: url })}
            />
          </div>
          <div className="flex flex-col gap-3">
            <input className="border p-2 rounded" placeholder="Default Form Master's name" {...field("formMasterDefaultName")} />
            <ImageUpload
              label="Form Master's signature"
              currentUrl={school.formMasterSigUrl}
              onUploaded={(url) => setSchool({ ...school, formMasterSigUrl: url })}
            />
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          These are currently reference fields — wiring them into the exported image cells is a small
          follow-up in exportToExcel.js once you're ready for it.
        </p>
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}
      {saved && <p className="text-green-700 text-sm">Saved.</p>}
      <button className="bg-slate-900 text-white p-2 rounded disabled:opacity-50 self-start px-6" disabled={saving}>
        {saving ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
