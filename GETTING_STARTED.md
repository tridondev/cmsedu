# Getting Started — CMSEDU

This walks you from an empty Firebase project to a live app on Netlify, in order.
Do the steps in sequence — later steps depend on earlier ones.

**Important architecture note before you start:** Netlify hosts the **React frontend only**.
Auth, Firestore, Storage, and Cloud Functions still run on **Firebase** — Netlify can't run
those. So you'll use two dashboards: Firebase (backend) and Netlify (frontend hosting). This
is the standard, normal way to pair the two; nothing about it is a workaround.

---
## 0. Prerequisites

- Node.js 20+ and npm installed
- A free [Firebase](https://console.firebase.google.com) account
- A free [Netlify](https://app.netlify.com) account
- (Recommended) A [GitHub](https://github.com) account — Netlify auto-deploys from a repo far
  more smoothly than drag-and-drop uploads

---
## 1. Create the Firebase project

1. Go to the Firebase Console → **Add project** → name it (e.g. `cmsedu-prod`) → finish the
   wizard (Google Analytics is optional, skip it if unsure).
2. In the project, go to **Build → Authentication → Get started** → enable the
   **Email/Password** sign-in provider.
3. Go to **Build → Firestore Database → Create database** → start in **production mode** →
   pick a region close to your schools (e.g. a European or African region if you're in
   Nigeria — lower latency for your users).
4. Go to **Build → Storage → Get started** → keep default production rules for now (we'll
   tighten these when signature/logo upload is added).
5. Go to **Build → Functions** — you'll be prompted to upgrade to the **Blaze (pay-as-you-go)
   plan**. This is required for Cloud Functions to deploy; Firebase's free tier for
   Functions/Firestore usage is generous, so a small number of schools will cost close to
   nothing, but a card is required on file.

---
## 2. Register a Web App and get your config

1. In Firebase Console → Project Overview → click the **`</>`** (Web) icon → register an app
   (name it `cmsedu-web`) → **don't** check "Firebase Hosting" (you're using Netlify).
2. Copy the `firebaseConfig` object shown — you'll need these six values in step 4.

---
## 3. Install the Firebase CLI and log in

```bash
npm install -g firebase-tools
firebase login
```

From inside the project folder:

```bash
cd cmsedu
firebase use --add
# select the project you just created, give it an alias like "default"
```

---
## 4. Configure environment variables locally

```bash
cp .env.example .env
```

Open `.env` and paste in the six values from step 2:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

---
## 5. Install dependencies and run locally

```bash
npm install
npm run dev
```

Open the printed `localhost` URL. You should see the CMSEDU landing page. Nothing will work
yet (no data, no admin) — that's expected until the next steps.

---
## 6. Deploy Firestore security rules

```bash
firebase deploy --only firestore:rules
```

This pushes `firebase/firestore.rules` live, so the app is locked down correctly from the
start (no open database while you build).

---
## 7. Deploy the Cloud Functions — OR use the free Spark-plan path

Cloud Functions require the **Blaze** billing plan. If your card isn't going through yet
(common with some local card issuers — try enabling international transactions on the card
first), you don't have to wait. Skip straight to **7b** below and come back to deploy real
Functions later; nothing you build in the meantime is wasted.

**7a. If Blaze is enabled:**
```bash
cd functions
npm install firebase-admin firebase-functions exceljs
cd ..
firebase deploy --only functions
```
This deploys `createSchoolAdmin`, `inviteTeacher`, and `recomputeClassPositions`. Skip to
step 8.

**7b. If you're staying on the free Spark plan for now:**

Nothing to deploy. Two workarounds are already built into the scaffold:

- **Creating school admins / teachers** → instead of calling a Cloud Function, run the
  equivalent Admin SDK script locally (uses the same `serviceAccountKey.json` from step 8
  below — Admin SDK operations don't require Blaze, only *deploying Functions* does):
  ```bash
  node scripts/createSchoolAdmin.js <schoolId> <email> <password> "<name>"
  node scripts/inviteTeacher.js <schoolId> <email> <password> "<name>" jss3:math,jss3:english
  ```
  Find `<schoolId>` in Firestore Console → `schools` collection → the document ID.
- **Position/grade recompute** → runs client-side in `ScoreEntryGrid.jsx` right after a
  teacher saves a score, using the exact same `computeClassPositions` function the Cloud
  Function would otherwise call. Already wired up — no action needed.
- **Image storage** (school logo, signatures) → uses **Cloudinary's free tier** instead of
  Firebase Storage (which also now requires Blaze for new buckets). Sign up free at
  [cloudinary.com](https://cloudinary.com), no card required — setup steps are in
  `src/lib/cloudinaryUpload.js`. Add the two values it asks for to your `.env`.

You can switch to real Cloud Functions later (step 7a) without changing any other code — the
Firestore documents they read/write are the same shape either way.

---
## 8. Create your first Super Admin (bootstrap)

The app can only create school admins if a platform admin already exists — so the very first
one is created directly, once, from your machine:

1. Firebase Console → **Project settings (gear icon) → Service accounts** →
   **Generate new private key** → save the downloaded file as
   `scripts/serviceAccountKey.json`.
   (This file is already in `.gitignore` — never commit it or upload it to Netlify.)
2. Install the one dependency the script needs:
   ```bash
   cd scripts
   npm install firebase-admin
   cd ..
   ```
3. Run it:
   ```bash
   node scripts/createFirstPlatformAdmin.js you@example.com "YourStrongPassword!" "Your Name"
   ```
4. You'll see `Platform admin created: you@example.com`. That's your login for
   `/educms/admin`.

---
## 9. Test the full loop locally

1. `npm run dev`, visit `/educms/admin`, sign in with the credentials from step 8.
2. Create a school (e.g. name "Gaskiya High School", slug `gaskiya`) — note the access code
   shown.
3. (Once the admin-invite screen is wired up) use that access code to set up the school
   admin's real login, then visit `/educms/gaskiya` to sign in as that school.

If step 2 fails with a permissions error, double check `firebase deploy --only
firestore:rules` actually ran against the right project (`firebase use` output).

---
## 10. Push the project to GitHub

```bash
git init
git add .
git commit -m "Initial CMSEDU scaffold"
git branch -M main
git remote add origin https://github.com/<your-username>/cmsedu.git
git push -u origin main
```

(Create the empty repo on GitHub first if you haven't.)

---
## 11. Deploy the frontend to Netlify

**Option A — connect the repo (recommended):**
1. Netlify dashboard → **Add new site → Import an existing project** → choose GitHub → select
   your `cmsedu` repo.
2. Build settings (Netlify should auto-detect from `netlify.toml`, but confirm):
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
3. Before the first deploy, go to **Site configuration → Environment variables** and add the
   same six `VITE_FIREBASE_*` values from your `.env` file (Netlify needs its own copy — it
   never reads your local `.env`).
4. Click **Deploy site**. Netlify will build and give you a URL like
   `https://cmsedu-yourname.netlify.app`.

**Option B — CLI deploy (no GitHub):**
```bash
npm install -g netlify-cli
netlify login
netlify init          # creates/links a Netlify site
netlify env:set VITE_FIREBASE_API_KEY "..."
netlify env:set VITE_FIREBASE_AUTH_DOMAIN "..."
netlify env:set VITE_FIREBASE_PROJECT_ID "..."
netlify env:set VITE_FIREBASE_STORAGE_BUCKET "..."
netlify env:set VITE_FIREBASE_MESSAGING_SENDER_ID "..."
netlify env:set VITE_FIREBASE_APP_ID "..."
npm run build
netlify deploy --prod
```

The included `netlify.toml` already sets the SPA redirect rule (`/* → /index.html`) so client
-side routes like `/educms/gaskiya/admin` load correctly on refresh — without it, refreshing
any nested route would 404.

---
## 11b. Set up the access-code redemption function

This is what makes the access code shown on the Super Admin dashboard actually work — a
school admin can activate their own login by entering it, instead of you running
`createSchoolAdmin.cjs` manually every time. It runs as a **Netlify Function** (separate from
Firebase Cloud Functions), so it works fully on the free Spark plan.

1. Base64-encode your `scripts/serviceAccountKey.json`:
   ```powershell
   # PowerShell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("scripts/serviceAccountKey.json")) | Set-Clipboard
   ```
   ```bash
   # macOS/Linux
   base64 -i scripts/serviceAccountKey.json | pbcopy   # or | xclip on Linux
   ```
2. Netlify dashboard → **Site configuration → Environment variables** → **Add a variable**:
   - Key: `FIREBASE_SERVICE_ACCOUNT_BASE64`
   - Value: paste the base64 string from step 1
   - Scope: all deploy contexts
3. Redeploy the site (env var changes require a new deploy to take effect).
4. Test it: go to `/educms/<your-school-slug>` → **"First time? Activate access"** tab → fill
   in the access code shown on the Super Admin dashboard. On success it creates the real
   login and signs the admin in immediately.

**Testing locally before deploying:** Vite's `npm run dev` does **not** run Netlify
Functions — only `netlify dev` does (it proxies both Vite and the functions together):
```bash
npm install -g netlify-cli
netlify link                      # link this folder to your Netlify site
netlify env:set FIREBASE_SERVICE_ACCOUNT_BASE64 "paste-the-base64-string-here"
netlify dev
```
Then use the URL `netlify dev` prints (usually `localhost:8888`, not 5173) so requests to
`/.netlify/functions/*` actually resolve.

The Super Admin dashboard's **"Regenerate code"** and **"Revoke admin access"** buttons use a
second function (`schoolAdminActions.js`) protected by your platform-admin login token — no
extra setup needed, it shares the same `FIREBASE_SERVICE_ACCOUNT_BASE64` variable.

---
## 12. Authorize your Netlify domain in Firebase

Firebase blocks Auth from unrecognized domains by default:

1. Firebase Console → **Authentication → Settings → Authorized domains** →
   **Add domain** → paste your Netlify URL (e.g. `cmsedu-yourname.netlify.app`).
2. If you later attach a custom domain in Netlify, add that here too.

---
## 13. Ongoing workflow

- **Frontend changes** (React/UI): push to GitHub → Netlify auto-builds and deploys.
- **Backend changes** (Firestore rules, Cloud Functions): still need
  `firebase deploy --only firestore:rules` / `--only functions` from your machine or CI —
  Netlify does not deploy these.
- Consider adding a GitHub Action later to run `firebase deploy` automatically on push, once
  the schema stabilizes, so both sides deploy from one `git push`.

---
## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Blank page on Netlify, works locally | Missing `VITE_FIREBASE_*` env vars in Netlify site settings |
| `auth/unauthorized-domain` error | Netlify domain not added to Firebase Authorized domains (step 12) |
| 404 on refresh at `/educms/gaskiya/admin` | `netlify.toml` redirect missing or not deployed — confirm it's committed |
| "Missing or insufficient permissions" in Firestore | Rules not deployed, or user's custom claims not set yet (claims only refresh on next token refresh / re-login) |
| Cloud Function deploy fails asking for billing | Functions require the Blaze plan — enable it in Firebase Console → Usage and billing |
