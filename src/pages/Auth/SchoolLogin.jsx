import { useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

/**
 * Two modes:
 *  - "signin": normal email/password, for admins/teachers who already have
 *    an account (created via redemption below, or via scripts/*.cjs).
 *  - "activate": first-time school admin setup. Calls the Netlify function
 *    `redeemAccessCode`, which validates the access code server-side (using
 *    the Admin SDK) and creates the real login with correct permissions —
 *    then signs the new admin straight in.
 */
export default function SchoolLogin() {
  const { schoolSlug } = useParams();
  const { login } = useAuth();
  const [mode, setMode] = useState("signin");

  return (
    <div className="max-w-sm mx-auto mt-20">
      <div className="flex gap-2 mb-6 text-sm">
        <button
          className={`flex-1 p-2 rounded ${mode === "signin" ? "bg-slate-900 text-white" : "bg-slate-100"}`}
          onClick={() => setMode("signin")}
        >
          Sign in
        </button>
        <button
          className={`flex-1 p-2 rounded ${mode === "activate" ? "bg-slate-900 text-white" : "bg-slate-100"}`}
          onClick={() => setMode("activate")}
        >
          First time? Activate access
        </button>
      </div>
      {mode === "signin" ? <SignInForm login={login} /> : <ActivateForm slug={schoolSlug} login={login} />}
    </div>
  );
}

function SignInForm({ login }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      // AppRoutes' RequireRole reads custom claims after this and routes
      // to /admin or /teacher automatically based on role.
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold">School Login</h2>
      <input
        className="border p-2 rounded"
        placeholder="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <input
        className="border p-2 rounded"
        placeholder="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button className="bg-slate-900 text-white p-2 rounded disabled:opacity-50" disabled={loading}>
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

function ActivateForm({ slug, login }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/.netlify/functions/redeemAccessCode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, email, password, name, accessCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");

      setDone(true);
      await login(email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return <p className="text-green-700 text-sm">Account created — signing you in…</p>;
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold">Activate School Admin Access</h2>
      <p className="text-sm text-slate-500">
        Use the access code your platform admin gave you. This creates your permanent login —
        you'll use "Sign in" above from now on.
      </p>
      <input
        className="border p-2 rounded"
        placeholder="Your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <input
        className="border p-2 rounded"
        placeholder="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <input
        className="border p-2 rounded"
        placeholder="Choose a password (min 8 characters)"
        type="password"
        minLength={8}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      <input
        className="border p-2 rounded uppercase"
        placeholder="Access code (e.g. GAS-KPFWE5)"
        value={accessCode}
        onChange={(e) => setAccessCode(e.target.value)}
        required
      />
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button className="bg-slate-900 text-white p-2 rounded disabled:opacity-50" disabled={loading}>
        {loading ? "Activating…" : "Activate & sign in"}
      </button>
    </form>
  );
}

function friendlyAuthError(err) {
  if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password") return "Incorrect email or password.";
  if (err.code === "auth/user-not-found") return "No account found for this email.";
  if (err.code === "auth/too-many-requests") return "Too many attempts — please wait a moment and try again.";
  return err.message;
}
