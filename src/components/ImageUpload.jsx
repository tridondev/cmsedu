import { useState } from "react";
import { uploadImage } from "../lib/cloudinaryUpload";

/**
 * Drop-in uploader for school logos and principal/form-master signature images.
 * Calls onUploaded(url) once done — parent decides where that URL gets saved
 * (e.g. schools/{schoolId}.logoUrl or .signatures.principalSigUrl).
 */
export default function ImageUpload({ label, currentUrl, onUploaded }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(currentUrl || null);

  const handleChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const url = await uploadImage(file);
      setPreview(url);
      onUploaded(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="field-label">{label}</label>
      <div className="flex items-center gap-3">
        <div className="h-16 w-16 shrink-0 rounded-xl border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center overflow-hidden">
          {preview ? (
            <img src={preview} alt={label} className="h-full w-full object-contain" />
          ) : (
            <span className="text-slate-300 text-xs text-center px-1">No image</span>
          )}
        </div>
        <label className="btn-secondary btn-sm cursor-pointer">
          {uploading ? "Uploading…" : "Choose file"}
          <input type="file" accept="image/*" className="hidden" onChange={handleChange} disabled={uploading} />
        </label>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
