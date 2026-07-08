// src/lib/cloudinaryUpload.js
//
// Free alternative to Firebase Storage while your billing card is unresolved.
// Cloudinary's free tier (25GB storage/bandwidth) needs no card at all.
//
// Setup (one-time, ~3 minutes):
//   1. Sign up free at https://cloudinary.com
//   2. Dashboard shows your "Cloud name" — copy it.
//   3. Settings (gear icon) → Upload → "Upload presets" → Add upload preset
//      → Signing Mode: UNSIGNED → Save. Copy the preset name.
//   4. Add both to your .env:
//        VITE_CLOUDINARY_CLOUD_NAME=your_cloud_name
//        VITE_CLOUDINARY_UPLOAD_PRESET=your_preset_name
//
// This uploads directly from the browser to Cloudinary — no backend needed,
// works fine on the free Spark plan. Swap back to Firebase Storage later by
// replacing this file's implementation; every call site just awaits a URL
// string either way, so nothing else in the app needs to change.

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

/**
 * @param {File} file  the image file from an <input type="file"> change event
 * @returns {Promise<string>} the public HTTPS URL of the uploaded image
 */
export async function uploadImage(file) {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error(
      "Cloudinary not configured — set VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET in .env"
    );
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", UPLOAD_PRESET);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Cloudinary upload failed: ${err}`);
  }

  const data = await res.json();
  return data.secure_url; // store this string directly on the Firestore doc
}
