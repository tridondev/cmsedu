// Cloud Functions (Node, Firebase Functions v2)
//
// Deploy with: firebase deploy --only functions
// npm i firebase-admin firebase-functions exceljs inside /functions first.

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();

/** Super Admin calls this to create a School Admin account + set custom claims. */
exports.createSchoolAdmin = onCall(async (request) => {
  const callerClaims = request.auth?.token;
  if (!callerClaims?.platformAdmin) throw new HttpsError("permission-denied", "Not a platform admin");

  const { schoolId, email, name } = request.data;
  const tempPassword = Math.random().toString(36).slice(-10);
  const userRecord = await admin.auth().createUser({ email, password: tempPassword, displayName: name });
  await admin.auth().setCustomUserClaims(userRecord.uid, { role: "admin", schoolId });
  await db.doc(`schools/${schoolId}/users/${userRecord.uid}`).set({ role: "admin", name, email });

  return { uid: userRecord.uid, tempPassword };
});

/** School Admin calls this to invite a teacher, scoped to specific subjects/classes. */
exports.inviteTeacher = onCall(async (request) => {
  const callerClaims = request.auth?.token;
  const { schoolId, email, name, assignedSubjects } = request.data;
  if (callerClaims?.role !== "admin" || callerClaims?.schoolId !== schoolId) {
    throw new HttpsError("permission-denied", "Not this school's admin");
  }

  const tempPassword = Math.random().toString(36).slice(-10);
  const userRecord = await admin.auth().createUser({ email, password: tempPassword, displayName: name });
  await admin.auth().setCustomUserClaims(userRecord.uid, { role: "teacher", schoolId });
  await db.doc(`schools/${schoolId}/users/${userRecord.uid}`).set({
    role: "teacher", name, email, assignedSubjects,
  });

  return { uid: userRecord.uid, tempPassword };
});

/**
 * Authoritative recompute: whenever a score doc is written, recalculate that
 * class/term's positions & class averages and store them at .../meta.
 * Keeps the UI and the exported workbook always in sync, and stops teachers
 * from being able to fake a position by editing only their own subject.
 */
exports.recomputeClassPositions = onDocumentWritten(
  "schools/{schoolId}/results/{resultKey}/scores/{scoreId}",
  async (event) => {
    const { schoolId, resultKey } = event.params;
    const scoresSnap = await db
      .collection(`schools/${schoolId}/results/${resultKey}/scores`)
      .get();

    const studentsScores = {};
    scoresSnap.forEach((d) => {
      const [studentId, subjectId] = d.id.split("_");
      const data = d.data();
      studentsScores[studentId] = studentsScores[studentId] || {};
      studentsScores[studentId][subjectId] = data.total || 0;
    });

    const subjectIds = [...new Set(scoresSnap.docs.map((d) => d.id.split("_")[1]))];

    // Uses the same pure function shipped to the client — kept in sync manually,
    // or shared via a small internal npm package in a larger deployment.
    const { computeClassPositions } = require("./resultEngineShared");
    const positions = computeClassPositions(studentsScores, subjectIds);

    await db.doc(`schools/${schoolId}/results/${resultKey}/meta/positions`).set(
      { positions, computedAt: Date.now() },
      { merge: true }
    );
  }
);
