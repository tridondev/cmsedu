import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
// Storage intentionally not used — Firebase Storage now requires the Blaze
// plan for new buckets. Images (logos/signatures) go through Cloudinary
// instead; see src/lib/cloudinaryUpload.js. Swap back in easily later:
// import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

// Populate these from your Firebase project settings (or use .env + import.meta.env)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// TEMP DEBUG — remove once login works. Logs which keys are missing without
// printing secrets in full.
if (import.meta.env.DEV) {
  const missing = Object.entries(firebaseConfig).filter(([, v]) => !v);
  if (missing.length) {
    console.error(
      "Missing Firebase env vars:",
      missing.map(([k]) => k).join(", "),
      "— check .env is in the project root and restart `npm run dev`."
    );
  } else {
    console.log("Firebase config loaded OK, apiKey starts with:", firebaseConfig.apiKey.slice(0, 6));
  }
}

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
// Cloud Functions also require Blaze to deploy. `functions` is still
// exported here for when you're back on Blaze and redeploy functions/index.js
// (createSchoolAdmin, inviteTeacher, recomputeClassPositions) — until then,
// the app uses the Spark-plan workarounds: scripts/createSchoolAdmin.js,
// scripts/inviteTeacher.js, and client-side recompute in ScoreEntryGrid.jsx.
export const functions = getFunctions(app);
