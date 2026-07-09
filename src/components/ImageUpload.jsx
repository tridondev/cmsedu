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
      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 max-w-md">
          {error.includes("not configured") ? (
            <>
              <p className="font-semibold mb-1">Image upload isn't set up yet.</p>
              <p>
                This needs a free Cloudinary account (no card required): sign up at{" "}
                <a href="https://cloudinary.com" target="_blank" rel="noreferrer" className="underline">
                  cloudinary.com
                </a>
                , copy your <b>Cloud name</b> from the dashboard, then Settings → Upload → Upload presets → add an
                <b> unsigned</b> preset and copy its name. Add both as <code>VITE_CLOUDINARY_CLOUD_NAME</code> and{" "}
                <code>VITE_CLOUDINARY_UPLOAD_PRESET</code> to your <code>.env</code> file (and to your host's
                environment variables if deployed), then redeploy/restart.
              </p>
            </>
          ) : (
            error
          )}
        </div>
      )}
    </div>
  );
}
