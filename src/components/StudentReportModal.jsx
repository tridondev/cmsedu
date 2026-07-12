import { useEffect, useState } from "react";
import { BEHAVIOUR_CRITERIA, RATING_BANDS, autoRemarks, formatOrdinalDate } from "../lib/resultEngine";

const RATING_LABELS = { A: "Excellent", B: "V.Good", C: "Good", D: "Pass", E: "Fair" };

// ─────────────────────────────────────────────────────────────────────────────
// Auto-fill behaviour ratings from a student's overall average.
//
// Logic: performance tier → default band for every criterion.
//   ≥ 70  → A (Excellent)   for all criteria
//   ≥ 60  → B (V.Good)      for most; Punctuality/Attendance kept at A
//   ≥ 50  → B (V.Good)      for all
//   ≥ 45  → C (Good)        for all
//   ≥ 40  → D (Pass)        for all
//    < 40 → D/E mix          for all (struggling students)
//
// These are DEFAULTS — the admin can tick anything they like before saving.
// ─────────────────────────────────────────────────────────────────────────────
function autoBehaviourFromAverage(average) {
  const avg = Number(average) || 0;
  const behaviour = {};

  if (avg >= 70) {
    // Excellent academic = A across the board
    BEHAVIOUR_CRITERIA.forEach((c) => { behaviour[c] = "A"; });
  } else if (avg >= 60) {
    // Very good — A for attendance-type criteria, B for the rest
    const attendanceCriteria = new Set(["Punctuality", "Attendance in Class", "Neatness", "Honesty"]);
    BEHAVIOUR_CRITERIA.forEach((c) => { behaviour[c] = attendanceCriteria.has(c) ? "A" : "B"; });
  } else if (avg >= 50) {
    BEHAVIOUR_CRITERIA.forEach((c) => { behaviour[c] = "B"; });
  } else if (avg >= 45) {
    BEHAVIOUR_CRITERIA.forEach((c) => { behaviour[c] = "C"; });
  } else if (avg >= 40) {
    BEHAVIOUR_CRITERIA.forEach((c) => { behaviour[c] = "D"; });
  } else {
    // Below 40 — mix of D and E
    const dCriteria = new Set(["Punctuality", "Attendance in Class", "Neatness"]);
    BEHAVIOUR_CRITERIA.forEach((c) => { behaviour[c] = dCriteria.has(c) ? "D" : "E"; });
  }

  return behaviour;
}

/**
 * Report-card details editor for a single student:
 *  • Behaviour & activities ratings — auto-filled from average on first open,
 *    fully editable per criterion.
 *  • Form Master's and Principal's remarks — auto-generated from average,
 *    fully editable.
 *  • Signature date & (Third Term) promotion comment.
 *
 * AUTO-FILL RULES
 * ───────────────
 * • First time this student is opened (no saved data yet): behaviour AND
 *   remarks are both auto-filled from the average immediately.
 * • If data already exists in Firestore (admin previously saved): existing
 *   values are loaded; auto-fill is only triggered by the explicit buttons.
 * • Admin can always override any field before saving.
 */
export default function StudentReportModal({ student, average, isThirdTerm, initial, onClose, onSave }) {
  const [behaviour, setBehaviour]             = useState({});
  const [formMasterRemark, setFormMasterRemark] = useState("");
  const [principalRemark, setPrincipalRemark]   = useState("");
  const [promotionComment, setPromotionComment] = useState("");
  const [signatureDate, setSignatureDate]       = useState("");
  const [saving, setSaving]                     = useState(false);
  const [autoFilled, setAutoFilled]             = useState(false); // shows a subtle badge on first auto-fill

  // ── Seed state whenever the modal opens for a new student ──────────────
  useEffect(() => {
    const hasExistingData =
      initial?.formMasterRemark ||
      initial?.principalRemark  ||
      (initial?.behaviour && Object.keys(initial.behaviour).length > 0);

    if (hasExistingData) {
      // Restore exactly what was saved before. Signature date is the one
      // exception: if an older record was saved before a date was ever
      // entered, default it to today rather than leaving it blank — still
      // fully editable, and re-saving today doesn't overwrite a date that
      // was genuinely already there.
      setBehaviour(initial?.behaviour || {});
      setFormMasterRemark(initial?.formMasterRemark || "");
      setPrincipalRemark(initial?.principalRemark   || "");
      setPromotionComment(initial?.promotionComment || "");
      setSignatureDate(initial?.signatureDate || formatOrdinalDate());
      setAutoFilled(false);
    } else {
      // No saved data yet → auto-fill everything from the average, right
      // away (before Save is ever clicked), including today's date.
      const avg = Number(average) || 0;
      const { formMasterRemark: fm, principalRemark: pr } = autoRemarks(avg);
      setBehaviour(autoBehaviourFromAverage(avg));
      setFormMasterRemark(fm);
      setPrincipalRemark(pr);
      setPromotionComment("");
      setSignatureDate(formatOrdinalDate());
      setAutoFilled(true);
    }
  }, [initial, student?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const setBand = (criterion, band) =>
    setBehaviour((prev) => ({ ...prev, [criterion]: band }));

  // Manual re-trigger buttons
  const autoFillBehaviour = () => {
    setBehaviour(autoBehaviourFromAverage(Number(average) || 0));
  };

  const generateRemarks = () => {
    const { formMasterRemark: fm, principalRemark: pr } = autoRemarks(Number(average) || 0);
    setFormMasterRemark(fm);
    setPrincipalRemark(pr);
  };

  const autoFillAll = () => {
    autoFillBehaviour();
    generateRemarks();
    setAutoFilled(true);
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

  // Performance tier label for the auto-fill badge
  const { tier } = autoRemarks(Number(average) || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-2xl sm:rounded-2xl shadow-lifted max-h-[90vh] overflow-y-auto p-5 sm:p-6 flex flex-col gap-6">

        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="page-title">Report card details</h3>
            <p className="page-subtitle">
              {student?.fullName} — average {average ?? "-"}
              {average != null && (
                <span className="ml-2 inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700">
                  {tier}
                </span>
              )}
            </p>
          </div>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>

        {/* ── Auto-fill notice (first open only) ── */}
        {autoFilled && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2.5 flex items-start gap-3">
            <span className="text-emerald-600 text-lg leading-none mt-0.5">✦</span>
            <div>
              <p className="text-sm font-semibold text-emerald-800">Auto-filled from performance</p>
              <p className="text-xs text-emerald-700 mt-0.5">
                Behaviour ratings and remarks have been suggested based on an average of <b>{average}</b>.
                Review and adjust anything before saving.
              </p>
            </div>
            <button
              className="ml-auto text-xs text-emerald-600 underline whitespace-nowrap"
              onClick={() => setAutoFilled(false)}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* ── Behaviour & Activities ── */}
        <div>
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <label className="field-label mb-0">Behaviour &amp; activities rating</label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Tick one band per row</span>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={autoFillBehaviour}
                title="Reset behaviour ratings to match this student's academic performance"
              >
                ↺ Auto-fill from average
              </button>
            </div>
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
                  <tr key={criterion} className={behaviour[criterion] ? "" : "bg-amber-50/40"}>
                    <td className="text-slate-700">{criterion}</td>
                    {RATING_BANDS.map((b) => (
                      <td key={b} className="text-center">
                        <input
                          type="radio"
                          name={`band-${criterion}-${student?.id}`}
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
          {/* Show how many criteria still unrated */}
          {(() => {
            const unrated = BEHAVIOUR_CRITERIA.filter((c) => !behaviour[c]).length;
            return unrated > 0 ? (
              <p className="text-xs text-amber-600 mt-1.5">
                {unrated} criterion{unrated > 1 ? "a" : "ion"} not yet rated — highlighted above.
              </p>
            ) : (
              <p className="text-xs text-emerald-600 mt-1.5">✓ All criteria rated.</p>
            );
          })()}
        </div>

        {/* ── Remarks ── */}
        <div className="card-pad !p-4 bg-slate-50">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <label className="field-label mb-0">Remarks</label>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary btn-sm" onClick={generateRemarks}>
                ↺ Regenerate from average
              </button>
              <button type="button" className="btn-secondary btn-sm" onClick={autoFillAll}>
                ✦ Auto-fill everything
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <div>
              <label className="field-label">Form Master's remark</label>
              <textarea
                className="input"
                rows={2}
                value={formMasterRemark}
                onChange={(e) => setFormMasterRemark(e.target.value)}
                placeholder="Auto-generated or type your own…"
              />
            </div>
            <div>
              <label className="field-label">Principal's remark</label>
              <textarea
                className="input"
                rows={2}
                value={principalRemark}
                onChange={(e) => setPrincipalRemark(e.target.value)}
                placeholder="Auto-generated or type your own…"
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

        {/* ── Signature date ── */}
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <div className="flex items-center justify-between mb-0">
              <label className="field-label mb-0">Signature date</label>
              <button
                type="button"
                className="text-xs text-brand-600 underline"
                onClick={() => setSignatureDate(formatOrdinalDate())}
                title="Reset to today's date"
              >
                Use today
              </button>
            </div>
            <input
              className="input"
              placeholder="e.g. 13th December, 2025"
              value={signatureDate}
              onChange={(e) => setSignatureDate(e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save details"}
          </button>
        </div>
      </div>
    </div>
  );
}
