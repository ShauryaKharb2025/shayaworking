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
let isRefreshing = false;
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const hasToken = !!localStorage.getItem("sahay_access_token");
    if (error.response?.status === 401 && !original._retry && !isRefreshing && hasToken) {
      original._retry = true;
      isRefreshing = true;
      try {
        const { data } = await axios.post(
          `${import.meta.env.VITE_API_URL || "http://localhost:5000/api"}/auth/refresh`,
          {},
          { withCredentials: true }
        );
        localStorage.setItem("sahay_access_token", data.accessToken);
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch (refreshErr) {
        localStorage.removeItem("sahay_access_token");
        localStorage.removeItem("sahay_user");
        window.location.href = "/login";
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

export default api;
