// scripts/createFirstPlatformAdmin.cjs
//
// One-time bootstrap: the `createSchoolAdmin` Cloud Function requires the
// caller to already be a platform admin — so the very first one must be
// created directly with the Admin SDK, from your own machine, once.
//
// Usage:
//   1. Firebase Console → Project settings → Service accounts →
//      "Generate new private key" → save as scripts/serviceAccountKey.json
//      (this file is gitignored — never commit it or deploy it anywhere public)
//   2. cd scripts && npm install firebase-admin
//   3. node createFirstPlatformAdmin.cjs you@example.com "YourStrongPassword!" "Your Name"
//      (PowerShell: use single quotes if your password has a $ in it)

const { initializeApp, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("./serviceAccountKey.json");

const app = initializeApp({ credential: cert(serviceAccount) });
const auth = getAuth(app);
const db = getFirestore(app);

async function main() {
  const [, , email, password, name] = process.argv;
  if (!email || !password) {
    console.error('Usage: node createFirstPlatformAdmin.cjs <email> <password> "<name>"');
    process.exit(1);
  }

  const user = await auth.createUser({ email, password, displayName: name || "Super Admin" });
  await auth.setCustomUserClaims(user.uid, { platformAdmin: true });
  await db.doc(`platformAdmins/${user.uid}`).set({
    email,
    name: name || "Super Admin",
    createdAt: Date.now(),
  });

  console.log(`Platform admin created: ${email} (uid: ${user.uid})`);
  console.log("Sign in at /educms/admin with this email + password.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
