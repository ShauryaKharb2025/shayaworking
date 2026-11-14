import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { roleHome } from "../utils/roles";

const DEMO_ACCOUNTS = [
  { role: "patient", label: "Patient", email: "patient@sahay.org", name: "Aarav Sharma" },
  { role: "dispatcher", label: "Dispatcher", email: "dispatcher@sahay.org", name: "Priya Nair" },
  { role: "hospital", label: "Hospital ER", email: "hospital@sahay.org", name: "Dr. Alok Verma" },
  { role: "driver", label: "Driver", email: "driver1@sewa-ambulance.org", name: "Ramesh Kumar" },
  { role: "operator", label: "Operator", email: "operator@sewa-ambulance.org", name: "Sewa Trust" },
];

export default function Login() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("patient");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSignIn = async (account) => {
    setError(null);
    setSubmitting(true);
    const targetEmail = account?.email || email;
    const targetRole = account?.role || role;
    const targetName = account?.name;

    if (!targetEmail.trim()) {
      setError("Please enter a valid email address");
      setSubmitting(false);
      return;
    }

    try {
      const user = await login({ email: targetEmail.trim(), role: targetRole, name: targetName });
      navigate(roleHome(user.role));
    } catch (err) {
      setError(err?.response?.data?.message || "Sign in failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6 py-16">
      <p className="text-sm font-medium text-signal-dark">Sign in</p>

      <h1 className="mt-2 font-display text-3xl font-semibold text-navy">
        Access Sahay
      </h1>

      <p className="mt-3 text-sm leading-relaxed text-ink/60">
        Sign in to dispatch, monitor, or manage emergency ambulance and hospital referrals.
      </p>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">
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
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.org"
            className="mt-1.5 w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-navy focus:ring-1 focus:ring-navy"
          />
        </div>

        <div>
          <label htmlFor="role" className="block text-xs font-semibold uppercase tracking-wider text-ink/70">
            Role
          </label>
          <select
            id="role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-navy"
          >
            <option value="patient">Patient / Citizen</option>
            <option value="dispatcher">Dispatcher</option>
            <option value="hospital">Hospital ER Staff</option>
            <option value="driver">Ambulance Driver</option>
            <option value="operator">Fleet Operator</option>
            <option value="caregiver">Caregiver</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-full bg-navy py-2.5 text-sm font-semibold text-white transition hover:bg-navy-light disabled:opacity-50"
        >
          {submitting ? "Signing in..." : "Continue"}
        </button>
      </form>

      <div className="mt-8 border-t border-line/60 pt-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink/50">
          Quick demo sign-in
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {DEMO_ACCOUNTS.map((acc) => (
            <button
              key={acc.role}
              type="button"
              onClick={() => handleSignIn(acc)}
              disabled={submitting}
              className="rounded-lg border border-line bg-white/80 px-2.5 py-2 text-left text-xs font-medium text-navy transition hover:border-navy hover:bg-white"
            >
              <div className="font-semibold">{acc.label}</div>
              <div className="text-[10px] text-ink/50 truncate">{acc.email.split("@")[0]}</div>
            </button>
          ))}
        </div>
      </div>

      <p className="mt-10 text-xs text-ink/40">
        In an emergency right now, dial 112 directly — don't wait on sign-in.
      </p>
    </div>
  );
}
