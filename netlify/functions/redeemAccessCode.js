// netlify/functions/redeemAccessCode.js
//
// Self-serve "first login" flow for a school admin. The Super Admin dashboard
// shows an access code when a school is created; this function is what makes
// that code actually mean something — it verifies it server-side (using the
// Admin SDK, which can set custom claims) and creates the real login.
//
// This intentionally runs on NETLIFY's function runtime, not Firebase Cloud
// Functions — Netlify Functions are free (125k invocations/mo on the free
// tier) and never require Firebase's Blaze plan, since nothing here touches
// Firebase billing at all; it just uses the Admin SDK as a client, the same
// way the local scripts/*.cjs bootstrap scripts do.
//
// Env vars required (set in Netlify site settings, NOT in a committed file):
//   FIREBASE_SERVICE_ACCOUNT_BASE64  — your serviceAccountKey.json, base64-encoded
//
// Local testing: `netlify dev` (reads .env / netlify env vars automatically).

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

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  const { slug, email, password, name, accessCode } = payload;
  if (!slug || !email || !password || !accessCode) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing required fields" }) };
  }
  if (password.length < 8) {
    return { statusCode: 400, body: JSON.stringify({ error: "Password must be at least 8 characters" }) };
  }

  const { auth, db } = getAdmin();

  try {
    const slugSnap = await db.doc(`slugs/${slug}`).get();
    if (!slugSnap.exists) {
      return { statusCode: 404, body: JSON.stringify({ error: "No school found for this link" }) };
    }
    const schoolId = slugSnap.data().schoolId;
    const schoolRef = db.doc(`schools/${schoolId}`);
    const schoolSnap = await schoolRef.get();
    if (!schoolSnap.exists) {
      return { statusCode: 404, body: JSON.stringify({ error: "School record not found" }) };
    }
    const school = schoolSnap.data();

    if (school.status !== "active") {
      return { statusCode: 403, body: JSON.stringify({ error: "This school's account is currently suspended" }) };
    }
    if (school.adminClaimed) {
      return {
        statusCode: 409,
        body: JSON.stringify({
          error: "This school's admin login has already been set up. Ask your platform admin to reset access if you've lost it.",
        }),
      };
    }
    // Case/whitespace-insensitive compare, since people retype codes by hand.
    if (String(accessCode).trim().toUpperCase() !== String(school.accessCode).trim().toUpperCase()) {
      return { statusCode: 403, body: JSON.stringify({ error: "Incorrect access code" }) };
    }

    const user = await auth.createUser({ email, password, displayName: name || "School Admin" });
    await auth.setCustomUserClaims(user.uid, { role: "admin", schoolId });
    await db.doc(`schools/${schoolId}/users/${user.uid}`).set({
      role: "admin",
      name: name || "School Admin",
      email,
      createdAt: Date.now(),
      createdVia: "accessCodeRedemption",
    });
    await schoolRef.update({
      adminClaimed: true,
      adminClaimedAt: Date.now(),
      adminUid: user.uid,
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
