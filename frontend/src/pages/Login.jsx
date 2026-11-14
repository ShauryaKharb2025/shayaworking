import GoogleButton from "../components/GoogleButton";

export default function Login() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6 py-16">
      <p className="text-sm font-medium text-signal-dark">
        Sign in
      </p>

      <h1 className="mt-2 font-display text-3xl font-semibold text-navy">
        Continue with Google
      </h1>

      <p className="mt-3 text-sm leading-relaxed text-ink/60">
        New accounts start with patient access. Staff dashboards use the role assigned to your account.
      </p>

      <div className="mt-8">
        <GoogleButton />
      </div>

      <p className="mt-10 text-xs text-ink/40">
        In an emergency right now, dial 112 directly — don't wait on sign-in.
      </p>
    </div>
  );
}