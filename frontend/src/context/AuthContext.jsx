import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "../api/axios";
import { disconnectSocket } from "../api/socket";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("jsetu_user");
    return raw ? JSON.parse(raw) : null;
  });
  const [loading, setLoading] = useState(false);

  // Called with the Google Identity Services credential (idToken).
  const loginWithGoogle = useCallback(async (idToken, role) => {
    setLoading(true);
    try {
      const { data } = await api.post("/auth/google", { idToken, role });
      disconnectSocket();
      localStorage.setItem("jsetu_access_token", data.accessToken);
      localStorage.setItem("jsetu_user", JSON.stringify(data.user));
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
      disconnectSocket();
      localStorage.removeItem("jsetu_access_token");
      localStorage.removeItem("jsetu_user");
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
