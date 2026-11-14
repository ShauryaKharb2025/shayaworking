import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function GoogleButton({ role = "patient", onSuccess }) {
  const ref = useRef(null);
  const { loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

    if (!clientId || !window.google || !ref.current) return;

    window.google.accounts.id.initialize({
      client_id: clientId,

      callback: async (response) => {
        const user = await loginWithGoogle(
          response.credential,
          role
        );

        onSuccess?.(user);

        navigate(roleHome(user.role));
      },
    });

    window.google.accounts.id.renderButton(ref.current, {
      theme: "outline",
      size: "large",
      shape: "pill",
      width: 280,
    });
  }, [role]);

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  if (!clientId) {
    return (
      <div className="rounded-lg border border-dashed border-line bg-white/60 p-4 text-sm text-ink/60">
        Sign-in is currently unavailable in this local setup. You can explore the dashboard preview from Home. In an emergency, call 112.
      </div>
    );
  }

  return <div ref={ref} />;
}

export function roleHome(role) {
  switch (role) {
    case "dispatcher":
    case "admin":
      return "/dispatcher";

    case "hospital":
      return "/hospital";

    case "operator":
      return "/operator";

    case "driver":
      return "/driver";

    case "clinician":
      return "/clinician";

    case "caregiver":
      return "/caregiver";

    default:
      return "/sos";
  }
}