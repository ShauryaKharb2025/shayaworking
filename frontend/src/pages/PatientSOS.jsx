import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../api/axios";
import { connectSocket } from "../api/socket";
import { useAuth } from "../context/AuthContext";
import { CaregiverInvitations, JourneyLog } from "../components/CaseWorkflow";
import JourneyMap from "../components/JourneyMap";
import { Ambulance, ArrowRight, Building2, Check, CheckCircle2, ChevronRight, ClipboardList, Clock3, HeartPulse, LocateFixed, MapPin, Pill, ShieldCheck, Users } from "../components/Icons";
const statusLabels={requested:"Finding an available ambulance",offered:"Awaiting driver acceptance",picked_up:"Patient picked up",arrived_hospital:"Arrived at hospital",waitlisted:"Outside current coverage",matched:"Ambulance matched",dispatched:"Ambulance dispatched",en_route:"Ambulance en route",arrived_pickup:"Arrived at pickup",en_route_hospital:"Travelling to hospital",handed_off:"Handoff complete",cancelled:"Request cancelled"};
export default function PatientSOS() {
 const {user}=useAuth(), navigate=useNavigate(),{id}=useParams();
 const preview=!user;
 const canRequest=!user || user.role==="patient";
 const [trip,setTrip]=useState(null),[loading,setLoading]=useState(!!user),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 const [address,setAddress]=useState(preview?"Patel Nagar, Delhi":""),[symptoms,setSymptoms]=useState(preview?"Severe chest pain, breathlessness, possible cardiac.":""),[needs,setNeeds]=useState("ALS"),[pickup,setPickup]=useState(null),[medical,setMedical]=useState(false);
 const updatePickup=useCallback(p=>setPickup(p),[]);
 const load=useCallback(async()=>{
  if(!user || !canRequest){setLoading(false);return}
  try {
   let selected;
   if(id) selected=(await api.get("/sos/"+id)).data.trip;
   else {
    const rows=(await api.get("/sos")).data.trips||[];
    selected=rows.find(t=>!["handed_off","cancelled"].includes(t.status));
    if(selected)selected=(await api.get("/sos/"+selected._id)).data.trip;
   }
   setTrip(selected||null);setError("");
  }catch(e){setError(e.response?.data?.message||"Could not refresh your case. Showing the last received information.");}
  finally{setLoading(false)}
 },[user,id]);
 useEffect(()=>{load();if(!user)return;const interval=setInterval(load,10000);return()=>clearInterval(interval)},[load,user]);
 useEffect(() => {
  const tripId = trip?._id;
  if (!tripId || !user || !canRequest) return;
  const socket = connectSocket();
  const join = () => socket.emit("join:trip", tripId);
  const refresh = event => { if (event?.tripId === tripId) load(); };
  join();
  socket.on("connect", join);
  for (const name of ["case:refresh", "trip:status", "trip:location"]) socket.on(name, refresh);
  return () => {
   socket.off("connect", join);
   socket.emit("leave:trip", tripId);
   for (const name of ["case:refresh", "trip:status", "trip:location"]) socket.off(name, refresh);
  };
 }, [trip?._id, user, canRequest, load]);
 function locate(){
  if(!navigator.geolocation){setError("Location sharing is unavailable. Drag the map pin to select pickup.");return}
  setBusy(true);
  navigator.geolocation.getCurrentPosition(pos=>{setPickup({lat:pos.coords.latitude,lng:pos.coords.longitude});setBusy(false);setError("")},()=>{setError("Location access was denied. Drag the map pin to choose pickup.");setBusy(false)},{timeout:10000});
 }
 async function submit(e){
  e.preventDefault();if(preview){navigate("/login");return}
  if(!pickup){setError("Share your location or drag the pickup pin before sending SOS.");return}
  if(!symptoms.trim()){setError("Describe the symptoms or reason for this request.");return}
  setBusy(true);setError("");
  try{
   const {data}=await api.post("/sos",{...pickup,address,channel:"app",symptoms:[symptoms.trim()],requestedAmbulanceTier:needs});
   setTrip(data.trip);navigate("/trip/"+data.trip._id);
  }catch(e){setError(e.response?.data?.message||"Could not send SOS. Please try again or call 112.");}
  finally{setBusy(false)}
 }
 const ambulance=trip?.ambulance,hospital=trip?.hospital;
 const stage=preview?2:({requested:0,offered:0,picked_up:2,arrived_hospital:3,matched:1,dispatched:1,en_route:2,arrived_pickup:2,en_route_hospital:3,handed_off:4}[trip?.status]??-1);
 const timeline=[
  ["SOS Received",preview?"Cardiac emergency (ALS)":trip?trip.address||"Emergency request received":"Your request will appear here",trip?.createdAt],
  ["Ambulance Assigned",preview?"ALS-03 · Crew: Paramedic + EMT":ambulance?.vehicleNumber||"Awaiting dispatcher assignment",trip?.dispatchedAt],
  ["Ambulance En Route",preview?"ETA: 6 min · 2.4 km":trip?.etaMinutes?("Estimated pickup: "+trip.etaMinutes+" min"):"ETA not yet available",null],
  [preview?"Hospital Confirmed (H4)":"Hospital destination",preview?"AIIMS · Cardiac Care · Sample readiness":hospital?.name?hospital.name+" · confirmed":trip?.proposedHospital?.name?trip.proposedHospital.name+" · proposed":"Awaiting hospital selection",null],
  ["Patient Handoff",preview?"At hospital (after arrival)":trip?.handedOffAt?"Handoff recorded":"Pending hospital arrival and handoff",trip?.handedOffAt]
 ];
 const time=value=>value?new Date(value).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"}):"Pending";
 return <div className="sahay-workspace">
  <div className="sahay-page-heading"><div className="sahay-hello-icon"><HeartPulse/></div><div><h1>{trip?"Your care journey":"Hi, Need help?"}</h1><p>Request a verified, equipped ambulance in seconds.</p></div><span className={"sahay-mode "+(preview?"":"connected")}>{preview?"Interactive design preview":"Connected to your account"}</span></div>
  {preview&&<div className="sahay-preview-note">Sample case and positions for exploring the design. <Link to="/login">Sign in to request an ambulance <ArrowRight size={14}/></Link></div>}
  {error&&<div className="sahay-alert" role="alert">{error}<button onClick={()=>setError("")} aria-label="Dismiss error">×</button></div>}
  <div className="sahay-dashboard-grid">
   <div className="sahay-primary">
    <div className="sahay-service-grid">
     <button className={"sahay-service sos "+(!medical?"selected":"")} onClick={()=>setMedical(false)}><Ambulance/><span><strong>Medical Emergency (SOS)</strong><small>Accident · Cardiac · Breathing · Serious Injury</small></span><ChevronRight/></button>
     <button className={"sahay-service medicine "+(medical?"selected":"")} onClick={()=>setMedical(true)}><Pill/><span><strong>Medicine / Medical Help</strong><small>Non-emergency medical assistance</small></span><ChevronRight/></button>
    </div>
    {medical&&<div className="sahay-medical-note"><Pill/><div><strong>Non-emergency assistance</strong><p>Medicine delivery and consultations are not available in this prototype. Contact your care provider for non-emergency help.</p></div><button onClick={()=>setMedical(false)}>Return to SOS</button></div>}
    <div className="sahay-stepper">{["Share Location","Describe Symptoms","Confirm Ambulance"].map((label,i)=><div key={label}><span className={(i===2?"current":"")}>{i+1}</span><strong>{label}</strong>{(preview|| (i===0&&pickup) || (i===1&&symptoms.trim()))&&i<2&&<CheckCircle2 className="sahay-green" size={18}/>}</div>)}</div>
    <div className="sahay-incident-map">
     <form className="sahay-card sahay-incident" onSubmit={submit}>
      <h2><ClipboardList/> Incident Details</h2>
      <label>Location (Pickup)<div className="sahay-input-icon"><MapPin size={19}/><input aria-label="Pickup address" value={trip?.address||address} disabled={!!trip} placeholder="Address or landmark" onChange={e=>setAddress(e.target.value)}/><button type="button" disabled={busy||!!trip} onClick={locate} aria-label="Use my current location"><LocateFixed size={19}/></button></div></label>
      {pickup&&<span className="sahay-coordinates">{pickup.lat.toFixed(4)}, {pickup.lng.toFixed(4)} · pickup selected</span>}
      <label>Symptoms / Reason <b className="sahay-red">*</b><textarea value={trip?(trip.symptoms?.join(", ")||trip.triage?.notes||"No symptom description recorded."):symptoms} onChange={e=>setSymptoms(e.target.value)} placeholder="Describe what happened…" rows={3} disabled={!!trip}/></label>
      <fieldset disabled={!!trip}><legend>Requested ambulance type</legend><div className="sahay-type-options">{["ALS","BLS"].map(type=><label key={type} className={(trip?.requestedAmbulanceTier||needs)===type?"checked":""}><input type="radio" name="ambulanceType" checked={(trip?.requestedAmbulanceTier||needs)===type} onChange={()=>setNeeds(type)}/>{type} ({type==="ALS"?"Advanced":"Basic"})</label>)}</div></fieldset>
      <p className="sahay-field-help">{trip?"Vehicle allocation and equipment are confirmed by dispatch.":"Preference for review. Dispatch determines the required vehicle and equipment."}</p>
      <button className="sahay-button dark sahay-confirm" type="submit" disabled={busy||!!trip||medical||!canRequest}>{!canRequest?"Patient account required":busy?"Please wait…":trip?"SOS request received":"Confirm & Send SOS"} {!trip&&<ArrowRight size={20}/>}</button>
      {trip&&<><Link to={"/trip/"+trip._id+"/details"} className="sahay-subtle-link">Trip controls &amp; messages →</Link><Link to="/patient/history" className="sahay-subtle-link">View your trip history</Link></>}
     </form>
     <JourneyMap preview={preview} trip={trip} pickup={pickup} onPickup={updatePickup}/>
    </div>
   </div>
   <aside className="sahay-case-column">
    <section className="sahay-card sahay-case-summary"><div><div><span className="sahay-muted">Case ID</span><h2>{preview?"SH-CARD-001":trip?trip._id:loading?"Loading…":"No active case"}</h2></div><span className="sahay-case-badge"><HeartPulse size={20}/>{preview?"ALS (Cardiac)":ambulance?.tier||"SOS"}</span></div><div className={"sahay-status "+(trip?.status==="cancelled"?"cancelled":"")}><span>i</span><b>Status:</b> {preview?"Ambulance En Route":loading?"Loading case…":statusLabels[trip?.status]||"Ready when you need help"}</div></section>
    <section className="sahay-card sahay-timeline"><h2><ClipboardList/> Response Timeline</h2><ol>{timeline.map(([title,description,at],i)=><li key={title} className={i<stage?"complete":i===stage?"current":""}><span className="sahay-timeline-node">{i<stage?<Check size={14}/>:null}</span><div><div><strong>{title}</strong><time>{preview?(i===0?"10:24 AM":i===1?"10:26 AM":i===2?"10:27 AM":"Pending"):time(at)}</time></div><p>{description}</p></div></li>)}</ol>{!preview&&<p className="sahay-timeline-foot">Updates refresh every 10 seconds. Pending milestones are not confirmations.</p>}</section>
    {trip && canRequest && <JourneyLog key={"log-" + trip._id} caseId={trip._id} />}
    {trip && canRequest && <CaregiverInvitations key={trip._id} tripId={trip._id} />}
   </aside>
  </div>
  <div className="sahay-summary-grid">
   <Summary icon={Ambulance} label="Ambulance" value={preview?"ALS-03":ambulance?.vehicleNumber||"Awaiting assignment"}/>
   <Summary icon={Users} label="Crew" value={preview?"Paramedic + EMT":ambulance?.crew?.map(c=>c.role+(c.certified?" ✓":"")).join(" + ")||"Not yet recorded"}/>
   <Summary icon={ClipboardList} label={preview?"Equipment (Sample verified)":ambulance?.complianceVerified?"Equipment · compliance verified":"Equipment"} value={preview?"Ventilator · Defibrillator · ECG · Oxygen":ambulance?.equipment?.join(" · ")||"Not yet recorded"} small/>
   <Summary icon={Building2} label={preview?"Hospital (Sample confirmed)":"Hospital destination"} value={preview?"H4 – AIIMS":hospital?.name||"Awaiting selection"}/>
   <Summary icon={Clock3} label={preview?"Sample ETA":"Estimated arrival"} value={preview?"6 min":trip?.etaMinutes?trip.etaMinutes+" min":"Not available"}/>
  </div>
  <footer className="sahay-workspace-footer"><span><ShieldCheck size={15}/> Synthetic prototype · call <a href="tel:112">112</a> for emergency assistance</span><span>{preview?"Preview data only":trip?.ambulance?.lastPingAt?"GPS last seen "+time(trip.ambulance.lastPingAt):"GPS timestamp not available"}</span></footer>
 </div>
}
function Summary({icon:Icon,label,value,small}){return <section className="sahay-card sahay-summary"><Icon/><div><span>{label}</span><strong className={small?"small":""}>{value}</strong></div></section>}
