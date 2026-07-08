// scripts/createSchoolAdmin.cjs
//
// Spark-plan workaround for the `createSchoolAdmin` Cloud Function.
// Creating Auth users and setting custom claims via the Admin SDK does NOT
// require the Blaze plan — only Cloud Functions themselves do. So until your
// billing is sorted, run this locally instead of calling a function.
//
// Usage:
//   node scripts/createSchoolAdmin.cjs <schoolId> <email> <password> "<name>"
//
// Find <schoolId> in Firestore Console → schools collection → the doc ID of
// the school you created from the Super Admin dashboard.

const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("./serviceAccountKey.json");

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}
const auth = getAuth();
const db = getFirestore();

async function main() {
  const [, , schoolId, email, password, name] = process.argv;
  if (!schoolId || !email || !password) {
    console.error('Usage: node createSchoolAdmin.cjs <schoolId> <email> <password> "<name>"');
    process.exit(1);
  }

  const schoolDoc = await db.doc(`schools/${schoolId}`).get();
  if (!schoolDoc.exists) {
    console.error(`No school found with id ${schoolId}. Check the Firestore console for the correct doc ID.`);
    process.exit(1);
  }

  const user = await auth.createUser({ email, password, displayName: name || "School Admin" });
  await auth.setCustomUserClaims(user.uid, { role: "admin", schoolId });
  await db.doc(`schools/${schoolId}/users/${user.uid}`).set({
    role: "admin",
    name: name || "School Admin",
    email,
    createdAt: Date.now(),
  });

  console.log(`School admin created for "${schoolDoc.data().name}":`);
  console.log(`  Email: ${email}`);
  console.log(`  Login at: /educms/${schoolDoc.data().slug}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
