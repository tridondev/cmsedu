import { useEffect, useState } from "react";
import { BEHAVIOUR_CRITERIA, RATING_BANDS, autoRemarks } from "../lib/resultEngine";

const RATING_LABELS = { A: "Excellent", B: "V.Good", C: "Good", D: "Pass", E: "Fair" };

/**
 * Report-card details editor for a single student: behaviour ratings (tick
 * one band A–E per criterion, matching the printed template), Form Master's
 * and Principal's remarks (auto-drafted from the student's average, still
 * fully editable), and the signature date. Third Term additionally collects
 * a promotion comment for the Annual Summary box.
 */
export default function StudentReportModal({ student, average, isThirdTerm, initial, onClose, onSave }) {
  const [behaviour, setBehaviour] = useState(initial?.behaviour || {});
  const [formMasterRemark, setFormMasterRemark] = useState(initial?.formMasterRemark || "");
  const [principalRemark, setPrincipalRemark] = useState(initial?.principalRemark || "");
  const [promotionComment, setPromotionComment] = useState(initial?.promotionComment || "");
  const [signatureDate, setSignatureDate] = useState(initial?.signatureDate || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setBehaviour(initial?.behaviour || {});
    setFormMasterRemark(initial?.formMasterRemark || "");
    setPrincipalRemark(initial?.principalRemark || "");
    setPromotionComment(initial?.promotionComment || "");
    setSignatureDate(initial?.signatureDate || "");
  }, [initial, student?.id]);

  const setBand = (criterion, band) => setBehaviour((prev) => ({ ...prev, [criterion]: band }));

  const generateRemarks = () => {
    const { formMasterRemark: fm, principalRemark: pr } = autoRemarks(Number(average) || 0);
    setFormMasterRemark(fm);
    setPrincipalRemark(pr);
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave({ behaviour, formMasterRemark, principalRemark, promotionComment, signatureDate });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-2xl sm:rounded-2xl shadow-lifted max-h-[90vh] overflow-y-auto p-5 sm:p-6 flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="page-title">Report card details</h3>
            <p className="page-subtitle">{student?.fullName} — average {average ?? "-"}</p>
          </div>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="field-label mb-0">Behaviour &amp; activities rating</label>
            <span className="text-xs text-slate-400">Tick one band per row</span>
          </div>
          <div className="table-wrap">
            <table className="table-modern">
              <thead>
                <tr>
                  <th>Criterion</th>
                  {RATING_BANDS.map((b) => (
                    <th key={b} className="text-center">
                      {b}
                      <div className="text-[10px] font-normal text-slate-400">{RATING_LABELS[b]}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {BEHAVIOUR_CRITERIA.map((criterion) => (
                  <tr key={criterion}>
                    <td className="text-slate-700">{criterion}</td>
                    {RATING_BANDS.map((b) => (
                      <td key={b} className="text-center">
                        <input
                          type="radio"
                          name={`band-${criterion}`}
                          checked={behaviour[criterion] === b}
                          onChange={() => setBand(criterion, b)}
                          className="h-4 w-4 accent-brand-600 cursor-pointer"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card-pad !p-4 bg-slate-50">
          <div className="flex items-center justify-between mb-3">
            <label className="field-label mb-0">Remarks</label>
            <button type="button" className="btn-secondary btn-sm" onClick={generateRemarks}>
              Auto-generate from average
            </button>
          </div>
          <div className="flex flex-col gap-3">
            <div>
              <label className="field-label">Form Master's remark</label>
              <textarea
                className="input"
                rows={2}
                value={formMasterRemark}
                onChange={(e) => setFormMasterRemark(e.target.value)}
              />
            </div>
            <div>
              <label className="field-label">Principal's remark</label>
              <textarea
                className="input"
                rows={2}
                value={principalRemark}
                onChange={(e) => setPrincipalRemark(e.target.value)}
              />
            </div>
            {isThirdTerm && (
              <div>
                <label className="field-label">Promotion comment (Annual Summary)</label>
                <input
                  className="input"
                  placeholder="e.g. PROMOTED TO JSS 2"
                  value={promotionComment}
                  onChange={(e) => setPromotionComment(e.target.value)}
                />
              </div>
            )}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="field-label">Signature date</label>
            <input
              className="input"
              placeholder="e.g. 13th December, 2025"
              value={signatureDate}
              onChange={(e) => setSignatureDate(e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save details"}
          </button>
        </div>
      </div>
    </div>
  );
}
