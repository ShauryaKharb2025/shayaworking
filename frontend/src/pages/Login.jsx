import { useState } from "react";
import GoogleButton from "../components/GoogleButton";

const ROLES = [
  { value: "patient", label: "Patient / caregiver" },
  { value: "driver", label: "Ambulance driver" },
  { value: "hospital", label: "Hospital staff" },
  { value: "dispatcher", label: "Fleet dispatcher" },
  { value: "operator", label: "Ambulance operator / fleet partner" },
];

export default function Login() {
  const [role, setRole] = useState("patient");

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6 py-16">
      <p className="text-sm font-medium text-signal-dark">
        Sign in
      </p>

      <h1 className="mt-2 font-display text-3xl font-semibold text-navy">
        Continue with Google
      </h1>

      <p className="mt-3 text-sm leading-relaxed text-ink/60">
        First-time sign-in creates your account. Choose which role
        you're signing in as — driver, hospital, dispatcher, and
        operator tools are available according to your account role in this prototype.
      </p>

      <fieldset className="mt-8 space-y-2">
        <legend className="text-xs font-medium uppercase tracking-wide text-ink/40">
          I am a
        </legend>

        {ROLES.map((r) => (
          <label
            key={r.value}
            className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm ${
              role === r.value
                ? "border-navy bg-navy/5"
                : "border-line"
            }`}
          >
            <input
              type="radio"
              name="role"
              value={r.value}
              checked={role === r.value}
              onChange={() => setRole(r.value)}
              className="accent-navy"
            />

            {r.label}
          </label>
        ))}
      </fieldset>

      <div className="mt-8">
        <GoogleButton role={role} />
      </div>

      <p className="mt-10 text-xs text-ink/40">
        In an emergency right now, dial 112 directly — don't wait on sign-in.
      </p>
    </div>
  );
}