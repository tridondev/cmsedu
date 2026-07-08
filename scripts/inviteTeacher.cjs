// scripts/inviteTeacher.cjs
//
// Spark-plan workaround for the `inviteTeacher` Cloud Function. Same reasoning
// as createSchoolAdmin.cjs — no Blaze plan required for this.
//
// Usage:
//   node scripts/inviteTeacher.cjs <schoolId> <email> <password> "<name>" <classId>:<subjectId>[,<classId>:<subjectId>...]
//
// Example:
//   node scripts/inviteTeacher.cjs abc123 teacher@example.com "TempPass123!" "Mrs. Bello" jss3:math,jss3:english

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
  const [, , schoolId, email, password, name, assignments] = process.argv;
  if (!schoolId || !email || !password || !assignments) {
    console.error(
      'Usage: node inviteTeacher.cjs <schoolId> <email> <password> "<name>" <classId>:<subjectId>[,...]'
    );
    process.exit(1);
  }

  const assignedSubjects = assignments.split(",").map((pair) => {
    const [classId, subjectId] = pair.split(":");
    return { classId, subjectId };
  });

  const user = await auth.createUser({ email, password, displayName: name || "Teacher" });
  await auth.setCustomUserClaims(user.uid, { role: "teacher", schoolId });
  await db.doc(`schools/${schoolId}/users/${user.uid}`).set({
    role: "teacher",
    name: name || "Teacher",
    email,
    assignedSubjects,
    createdAt: Date.now(),
  });

  console.log(`Teacher created: ${email}`);
  console.log(`Assigned to: ${JSON.stringify(assignedSubjects)}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
