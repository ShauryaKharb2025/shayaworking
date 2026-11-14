import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { roleHome } from "../utils/roles";

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="border-b border-line bg-paper/90 backdrop-blur sticky top-0 z-40">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-2">
          <img src="/sahay-header.svg" alt="Sahay" width="210" height="55" />
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-medium text-ink/70 md:flex">
          <Link to="/" className="hover:text-ink">Home</Link>
          <Link to="/coverage" className="hover:text-ink">
            Coverage
          </Link>

          {user?.role === "patient" && (
            <Link to="/patient" className="hover:text-ink">
              Patient dashboard
            </Link>
          )}

          {["dispatcher", "admin"].includes(user?.role) && (
            <Link to="/dispatcher" className="hover:text-ink">
              Dispatcher console
            </Link>
          )}

          {user?.role === "hospital" && (
            <Link to="/hospital" className="hover:text-ink">
              ER console
            </Link>
          )}

          {user?.role === "operator" && (
            <Link to="/operator" className="hover:text-ink">
              Operator portal
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <button
                onClick={() => navigate(roleHome(user.role))}
                className="hidden text-sm font-medium text-ink/70 hover:text-ink sm:block"
              >
                {user.name.split(" ")[0]} · {user.role}
              </button>

              <button
                onClick={logout}
                className="rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-ink/40"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className="rounded-full bg-navy px-5 py-2 text-sm font-semibold text-white hover:bg-navy-light"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}