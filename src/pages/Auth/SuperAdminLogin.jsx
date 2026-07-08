import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export default function SuperAdminLogin() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    try {
      await login(email, password);
      nav("/educms/admin/dashboard");
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <form onSubmit={submit} className="max-w-sm mx-auto mt-24 flex flex-col gap-3">
      <h2 className="text-xl font-semibold">Super Admin Login</h2>
      <input className="border p-2 rounded" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input className="border p-2 rounded" placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button className="bg-slate-900 text-white p-2 rounded">Sign in</button>
    </form>
  );
}
