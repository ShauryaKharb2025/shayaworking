import { connectSocket } from "../api/socket";
import { useCallback, useEffect, useState } from "react";
import api from "../api/axios";

export function useCaseResource(path, period = 0) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!path) return;
    try {
      setData((await api.get(path)).data);
      setError("");
    } catch (err) {
      setData(null);
      setError(err.response?.data?.message || "Could not load case information.");
    }
  }, [path]);
  useEffect(() => {
    load();
    if (!path) return;
    const socket=connectSocket();
    const refresh=event=>{
      if(!event?.tripId || !path.startsWith("/cases/") || path.includes(event.tripId) || path.includes("/hospital/referrals") || path.includes("/clinician/queue"))load();
    };
    socket.on("case:refresh",refresh);
    const timer=period?setInterval(load,period):null;
    return ()=>{if(timer)clearInterval(timer);socket.off("case:refresh",refresh);};
  }, [load, path, period]);
  return { data, error, load };
}

