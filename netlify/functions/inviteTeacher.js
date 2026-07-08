// netlify/functions/inviteTeacher.js
//
// Called by a signed-in School Admin to create a teacher account scoped to
// their own school. Verifies the caller's ID token server-side (role=admin,
// matching schoolId) before touching anything — a school admin can only ever
// create teachers for their own school, never another one.

const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

function getAdmin() {
  if (!getApps().length) {
    const json = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf8");
    initializeApp({ credential: cert(JSON.parse(json)) });
  }
  return { auth: getAuth(), db: getFirestore() };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const { auth, db } = getAdmin();

  const authHeader = event.headers.authorization || event.headers.Authorization;
  const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) {
    return { statusCode: 401, body: JSON.stringify({ error: "Missing authorization token" }) };
  }

  let decoded;
  try {
    decoded = await auth.verifyIdToken(idToken);
  } catch {
    return { statusCode: 401, body: JSON.stringify({ error: "Invalid or expired token" }) };
  }
  if (decoded.role !== "admin" || !decoded.schoolId) {
    return { statusCode: 403, body: JSON.stringify({ error: "School admin access required" }) };
  }
  const schoolId = decoded.schoolId;

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  const { email, password, name, assignedSubjects } = payload;
  if (!email || !password || !Array.isArray(assignedSubjects) || assignedSubjects.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing email, password, or at least one assigned subject" }) };
  }
  if (password.length < 8) {
    return { statusCode: 400, body: JSON.stringify({ error: "Password must be at least 8 characters" }) };
  }

  try {
    const user = await auth.createUser({ email, password, displayName: name || "Teacher" });
    await auth.setCustomUserClaims(user.uid, { role: "teacher", schoolId });
    await db.doc(`schools/${schoolId}/users/${user.uid}`).set({
      role: "teacher",
      name: name || "Teacher",
      email,
      assignedSubjects,
      createdAt: Date.now(),
    });
    return { statusCode: 200, body: JSON.stringify({ ok: true, uid: user.uid }) };
  } catch (err) {
    if (err.code === "auth/email-already-exists") {
      return { statusCode: 409, body: JSON.stringify({ error: "An account with this email already exists" }) };
    }
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: "Something went wrong. Please try again." }) };
  }
};
