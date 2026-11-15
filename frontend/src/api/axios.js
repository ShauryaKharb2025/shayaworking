import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
  withCredentials: true, // sends the httpOnly refresh-token cookie
});

// Attach the access token (kept in memory / localStorage) to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("sahay_access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Transparent refresh-on-401, once, then give up
let refreshPromise = null;
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const hasToken = !!localStorage.getItem("sahay_access_token");
    if (!original?.url?.includes("/auth/login") && error.response?.status === 401 && !original._retry && hasToken) {
      original._retry = true;
      try {
        if (!refreshPromise) refreshPromise = axios.post(
          `${import.meta.env.VITE_API_URL || "http://localhost:5000/api"}/auth/refresh`, {}, { withCredentials: true }
        ).then(({data}) => {
          localStorage.setItem("sahay_access_token",data.accessToken);
          return data.accessToken;
        }).finally(() => { refreshPromise = null; });
        original.headers.Authorization = `Bearer ${await refreshPromise}`;
        return api(original);
      } catch (refreshErr) {
        localStorage.removeItem("sahay_access_token");
        localStorage.removeItem("sahay_user");
        window.location.href = "/login";
        return Promise.reject(refreshErr);
      }
    }
    return Promise.reject(error);
  }
);

export default api;
