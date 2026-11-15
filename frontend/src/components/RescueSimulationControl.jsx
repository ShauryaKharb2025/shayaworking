import {useState} from "react";
import {useCaseResource} from "../hooks/useCaseResource";
import api from "../api/axios";
export default function RescueSimulationControl({trip}){
 const {data}=useCaseResource(`/maritime/simulation/${trip._id}`);
 const [pending,setPending]=useState(false),[message,setMessage]=useState("");
 const gap=trip.events?.findLast(e=>["simulation:gps_interrupted","simulation:gps_restored"].includes(e.type));
 const interrupted=gap?.type==="simulation:gps_interrupted"&&Date.parse(gap.payload.until)>Date.now();
 if(!data?.enabled||!["en_route","en_route_hospital"].includes(trip.status))return null;
 return <div className="sahay-preview-note"><p>Synthetic resilience test · GPS interruption pauses mock position reports until Admin recovery or expiry.</p><button className="sahay-button" disabled={pending||interrupted} onClick={async()=>{setPending(true);try{const {data}=await api.post(`/maritime/simulation/${trip._id}/gps-gap`);setMessage(data.message);}catch(e){setMessage(e.response?.data?.message||"Could not start interruption");}finally{setPending(false);}}}>{interrupted?"Mock GPS interruption active":"Simulate GPS interruption"}</button>{message&&<p role="status">{message}</p>}</div>;
}
