import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { roleHome } from "../utils/roles";

const DEMO_ACCOUNTS = [
  {role:"admin",label:"Command centre",email:"admin@sahay.org"},
  { role: "patient", label: "Patient", email: "patient@sahay.org", name: "Aarav Sharma" },
  { role: "hospital", label: "Hospital ER", email: "hospital@sahay.org", name: "Dr. Alok Verma" },
  { role: "driver", label: "Ambulance / Driver", email: "driver.ramesh@sahay.local", name: "Ramesh Kumar" },
];

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSignIn = async (account) => {
    setError(null);
    setSubmitting(true);
    const targetEmail = account?.email || email;
    const targetPassword = account ? "SahayDemo123!" : password;

    if (!targetEmail.trim()) {
      setError("Please enter a valid email address");
      setSubmitting(false);
      return;
    }

    try {
      const user = await login({ email: targetEmail.trim(), password: targetPassword });
      navigate(roleHome(user.role));
    } catch (err) {
      setError(err?.response?.data?.message || "Sign in failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="sahay-login-card">
      <p className="text-sm font-medium text-signal-dark">Sign in</p>

      <h1 className="mt-2 font-display text-3xl font-semibold text-navy">
        Access Sahay
      </h1>

      <p className="mt-3 text-sm leading-relaxed text-ink/60">
        Sign in as a patient, ambulance driver, hospital receiving team or administrator.
      </p>

      {error && (
        <div role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">
          {error}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSignIn();
        }}
        className="mt-6 space-y-4"
      >
        <div>
          <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wider text-ink/70">
            Email address
          </label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.org"
            className="mt-1.5 w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-navy focus:ring-1 focus:ring-navy"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-xs font-semibold text-ink/70">Password</label>
          <input id="password" type="password" required autoComplete="current-password"
            value={password} onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm" />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-full bg-navy py-2.5 text-sm font-semibold text-white transition hover:bg-navy-light disabled:opacity-50"
        >
          {submitting ? "Signing in..." : "Continue"}
        </button>
      </form>

      {import.meta.env.DEV && <div className="mt-8 border-t border-line/60 pt-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink/50">
          Demo accounts — choose a role to sign in
        </p>
        <p className="mt-2 text-sm text-ink/70">Password for every demo account <code>SahayDemo123!</code></p>
        <div className="sahay-demo-accounts">
          {DEMO_ACCOUNTS.map((acc) => (
            <button
              key={acc.role}
              type="button"
              onClick={() => handleSignIn(acc)}
              disabled={submitting}
              className="rounded-lg border border-line bg-white/80 px-2.5 py-2 text-left text-xs font-medium text-navy transition hover:border-navy hover:bg-white"
            >
              <div className="font-semibold">{acc.label}</div>
              <div className="text-xs text-ink/60 break-all">{acc.email}</div>
            </button>
          ))}
        </div>
      </div>}

      <p className="mt-10 text-xs text-ink/40">
        In an emergency right now, dial 112 directly — don't wait on sign-in.
      </p>
    </div>
  );
}
