import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

/**
 * Two modes:
 *  - "signin": normal email/password, for admins/teachers who already have
 *    an account (created via redemption below, or via scripts/*.cjs).
 *  - "activate": first-time school admin setup. Calls the Netlify function
 *    `redeemAccessCode`, which validates the access code server-side (using
 *    the Admin SDK) and creates the real login with correct permissions —
 *    then signs the new admin straight in.
 *
 * After a successful sign-in, we watch the auth claims and route straight
 * to /admin or /teacher based on role — the tenant login page itself no
 * longer requires a manual click-through.
 */
export default function SchoolLogin({ schoolId }) {
  const { schoolSlug } = useParams();
  const { login, user, claims, loading } = useAuth();
  const [mode, setMode] = useState("signin");
  const navigate = useNavigate();

  useEffect(() => {
    if (loading || !user || !claims) return;
    if (claims.schoolId !== schoolId) return; // account belongs to a different school
    if (claims.role === "admin") navigate("admin", { replace: true });
    else if (claims.role === "teacher") navigate("teacher", { replace: true });
  }, [loading, user, claims, schoolId, navigate]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="px-5 sm:px-8 py-5">
        <a href="/" className="inline-flex items-center gap-2 font-display font-extrabold text-slate-900 text-lg">
          <span className="h-8 w-8 rounded-lg bg-brand-600 text-white flex items-center justify-center text-sm">C</span>
          CMSEDU
        </a>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm animate-slide-up">
          <div className="text-center mb-6">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Welcome back</h1>
            <p className="text-sm text-slate-500 mt-1">
              Signing in to <span className="font-semibold text-slate-700">{schoolSlug}</span>
            </p>
          </div>

          <div className="card-pad">
            <div className="grid grid-cols-2 gap-2 mb-6 text-sm bg-slate-100 rounded-xl p-1">
              <button
                type="button"
                className={`rounded-lg py-2 font-semibold transition ${
                  mode === "signin" ? "bg-white shadow-soft text-slate-900" : "text-slate-500"
                }`}
                onClick={() => setMode("signin")}
              >
                Sign in
              </button>
              <button
                type="button"
                className={`rounded-lg py-2 font-semibold transition ${
                  mode === "activate" ? "bg-white shadow-soft text-slate-900" : "text-slate-500"
                }`}
                onClick={() => setMode("activate")}
              >
                First time
              </button>
            </div>
            {mode === "signin" ? <SignInForm login={login} /> : <ActivateForm slug={schoolSlug} login={login} />}
          </div>
        </div>
      </main>
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
      // The parent page watches claims and routes to /admin or /teacher.
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <label className="field-label">Email</label>
        <input
          className="input"
          placeholder="you@school.edu"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div>
        <label className="field-label">Password</label>
        <input
          className="input"
          placeholder="••••••••"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      {error && <p className="text-red-600 text-sm bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
      <button className="btn-primary w-full mt-1" disabled={loading}>
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
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <div className="h-10 w-10 rounded-full border-2 border-emerald-200 border-t-emerald-600 animate-spin" />
        <p className="text-emerald-700 text-sm font-medium">Account created — signing you in…</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-xs text-slate-500 -mt-1">
        Use the access code your platform admin gave you. This creates your permanent login — you'll use "Sign in"
        above from now on.
      </p>
      <div>
        <label className="field-label">Your name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div>
        <label className="field-label">Email</label>
        <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div>
        <label className="field-label">Choose a password</label>
        <input
          className="input"
          placeholder="Min 8 characters"
          type="password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      <div>
        <label className="field-label">Access code</label>
        <input
          className="input uppercase tracking-wide"
          placeholder="e.g. GAS-KPFWE5"
          value={accessCode}
          onChange={(e) => setAccessCode(e.target.value)}
          required
        />
      </div>
      {error && <p className="text-red-600 text-sm bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
      <button className="btn-primary w-full mt-1" disabled={loading}>
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
