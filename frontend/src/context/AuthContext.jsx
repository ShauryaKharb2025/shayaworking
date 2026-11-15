import { createContext, useContext, useState, useCallback } from "react";
import api from "../api/axios";
import { disconnectSocket } from "../api/socket";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const saved=JSON.parse(localStorage.getItem("sahay_user") || "null");
      return saved && ["patient","driver","hospital","admin"].includes(saved.role) && localStorage.getItem("sahay_access_token") ? saved : null;
    } catch { return null; }
  });
  const [loading, setLoading] = useState(false);

  const login = useCallback(async ({ email, password }) => {
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      disconnectSocket();
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
      disconnectSocket();
      localStorage.removeItem("sahay_access_token");
      localStorage.removeItem("sahay_user");
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
