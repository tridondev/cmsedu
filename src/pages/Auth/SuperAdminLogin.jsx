import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export default function SuperAdminLogin() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      nav("/educms/admin/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="px-5 sm:px-8 py-5">
        <Link to="/" className="inline-flex items-center gap-2 font-display font-extrabold text-slate-900 text-lg">
          <span className="h-8 w-8 rounded-lg bg-brand-600 text-white flex items-center justify-center text-sm">C</span>
          CMSEDU
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm animate-slide-up">
          <div className="text-center mb-6">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Super Admin Login</h1>
            <p className="text-sm text-slate-500 mt-1">Platform-level access to onboard and manage schools.</p>
          </div>

          <form onSubmit={submit} className="card-pad flex flex-col gap-4">
            <div>
              <label className="field-label">Email</label>
              <input
                className="input"
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
        </div>
      </main>
    </div>
  );
}
