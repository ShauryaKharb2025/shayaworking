import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "../api/axios";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("sahay_user");
    return raw ? JSON.parse(raw) : null;
  });
  const [loading, setLoading] = useState(false);

  // Called with the Google Identity Services credential (idToken).
  // `role` is only used the first time an account is created.
  const loginWithGoogle = useCallback(async (idToken, role) => {
    setLoading(true);
    try {
      const { data } = await api.post("/auth/google", { idToken, role });
      localStorage.setItem("sahay_access_token", data.accessToken);
      localStorage.setItem("sahay_user", JSON.stringify(data.user));
      setUser(data.user);
      return data.user;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      localStorage.removeItem("sahay_access_token");
      localStorage.removeItem("sahay_user");
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
