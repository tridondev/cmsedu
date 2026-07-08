// netlify/functions/schoolAdminActions.js
//
// Platform-admin-only actions on a school's access:
//   - regenerateCode: issue a fresh access code (only while unclaimed — once
//     an admin exists, use revokeAdmin first if you need to replace them)
//   - revokeAdmin: disable the current school admin's login and reopen the
//     school for a fresh access-code redemption
//
// Caller must present a valid Firebase ID token (from the Super Admin's
// signed-in session) with the platformAdmin custom claim — verified here
// server-side, so this can't be called by a school admin or teacher account.

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

function randomAccessCode(prefix) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return `${(prefix || "SCH").slice(0, 3).toUpperCase()}-${code}`;
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
  if (!decoded.platformAdmin) {
    return { statusCode: 403, body: JSON.stringify({ error: "Platform admin access required" }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  const { action, schoolId } = payload;
  if (!action || !schoolId) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing action or schoolId" }) };
  }

  const schoolRef = db.doc(`schools/${schoolId}`);
  const schoolSnap = await schoolRef.get();
  if (!schoolSnap.exists) {
    return { statusCode: 404, body: JSON.stringify({ error: "School not found" }) };
  }
  const school = schoolSnap.data();

  if (action === "regenerateCode") {
    if (school.adminClaimed) {
      return {
        statusCode: 409,
        body: JSON.stringify({ error: "Admin already set up — use revokeAdmin first if you need to replace them" }),
      };
    }
    const accessCode = randomAccessCode(school.slug);
    await schoolRef.update({ accessCode });
    return { statusCode: 200, body: JSON.stringify({ ok: true, accessCode }) };
  }

  if (action === "revokeAdmin") {
    if (school.adminUid) {
      await auth.updateUser(school.adminUid, { disabled: true }).catch(() => {});
    }
    const accessCode = randomAccessCode(school.slug);
    await schoolRef.update({
      adminClaimed: false,
      adminUid: null,
      adminClaimedAt: null,
      accessCode,
    });
    return { statusCode: 200, body: JSON.stringify({ ok: true, accessCode }) };
  }

  return { statusCode: 400, body: JSON.stringify({ error: "Unknown action" }) };
};
