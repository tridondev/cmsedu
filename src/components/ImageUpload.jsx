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
      <label className="text-sm font-medium">{label}</label>
      {preview && <img src={preview} alt={label} className="h-16 object-contain border rounded" />}
      <input type="file" accept="image/*" onChange={handleChange} disabled={uploading} />
      {uploading && <p className="text-xs text-slate-500">Uploading…</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
