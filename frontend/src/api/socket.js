import { io } from "socket.io-client";

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(import.meta.env.VITE_SOCKET_URL || "http://localhost:5000", {
      autoConnect: false,
      auth: { token: localStorage.getItem("jsetu_access_token") },
    });
  }
  return socket;
}

export function connectSocket() {
  const s = getSocket();
  s.auth = { token: localStorage.getItem("jsetu_access_token") };
  if (!s.connected) s.connect();
  return s;
}
