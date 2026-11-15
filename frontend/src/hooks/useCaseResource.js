import { connectSocket } from "../api/socket";
import { useCallback, useEffect, useState, useRef } from "react";
import api from "../api/axios";

export function useCaseResource(path, period = 0) {
  const generation=useRef(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!path) return;
    const request=++generation.current;
    try {
      const result=(await api.get(path)).data;
      if(request!==generation.current)return;
      setData(result);
      setError("");
    } catch (err) {
      if(request!==generation.current)return;
      setData(null);
      setError(err.response?.data?.message || "Could not load case information.");
    }
  }, [path]);
  useEffect(() => {
    load();
    if (!path) return;
    const socket=connectSocket();
    const refresh=event=>{
      if(path==="/health")return;
      if(!event?.tripId || !path.startsWith("/cases/") || path.includes(event.tripId) || path.includes("/hospital/referrals"))load();
    };
    socket.on("case:refresh",refresh);
    socket.on("connect",load);
    const timer=period?setInterval(load,period):null;
    return ()=>{generation.current++;if(timer)clearInterval(timer);socket.off("case:refresh",refresh);socket.off("connect",load);};
  }, [load, path, period]);
  return { data, error, load };
}
