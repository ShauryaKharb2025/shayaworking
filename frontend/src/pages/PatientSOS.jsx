import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../api/axios";
import { connectSocket } from "../api/socket";
import { useAuth } from "../context/AuthContext";
import { CaregiverInvitations, JourneyLog } from "../components/CaseWorkflow";
import JourneyMap from "../components/JourneyMap";
import { Ambulance, ArrowRight, Building2, Check, CheckCircle2, ChevronRight, ClipboardList, Clock3, HeartPulse, LocateFixed, MapPin, Pill, ShieldCheck, Users } from "../components/Icons";
import { detectLocation, reverseGeocode } from "../api/location";
import { CRITICAL_CONDITIONS, PREFETCHED_HOSPITALS, PREFETCHED_AMBULANCES } from "../data/criticalConditions";
const statusLabels={requested:"Finding an available ambulance",offered:"Awaiting driver acceptance",picked_up:"Patient picked up",arrived_hospital:"Arrived at hospital",waitlisted:"Outside current coverage",matched:"Ambulance matched",dispatched:"Ambulance dispatched",en_route:"Ambulance en route",arrived_pickup:"Arrived at pickup",en_route_hospital:"Travelling to hospital",handed_off:"Handoff complete",cancelled:"Request cancelled"};
export default function PatientSOS() {
 const {user}=useAuth(), navigate=useNavigate(),{id}=useParams();
 const preview=!user;
 const canRequest=!user || user.role==="patient";
 const [trip,setTrip]=useState(null),[loading,setLoading]=useState(!!user),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 const [address,setAddress]=useState(""),[symptoms,setSymptoms]=useState(preview?"Cardiac Arrest / Acute Coronary Syndrome":""),[needs,setNeeds]=useState("ALS"),[pickup,setPickup]=useState(null),[medical,setMedical]=useState(false);
 const [selectedConditionId,setSelectedConditionId]=useState(preview?"cardiac-arrest":"");
 const [showFleet,setShowFleet]=useState(false);
 const [hospitals,setHospitals]=useState([]);
 const [selectedHospitalId,setSelectedHospitalId]=useState("");
 const currentCondition=CRITICAL_CONDITIONS.find(c=>c.id===selectedConditionId)||(preview?CRITICAL_CONDITIONS[0]:null);
 const assignedAmbulance=PREFETCHED_AMBULANCES.find(a=>currentCondition?a.tier===currentCondition.tier:true)||PREFETCHED_AMBULANCES[0];
 const selectedHospital=hospitals.find(h=>(h._id||h.id)===selectedHospitalId)||hospitals[0];

 useEffect(() => {
  let ignore = false;
  async function fetchNearestHospitals() {
    try {
      const params = {};
      if (pickup?.lat && pickup?.lng) {
        params.lat = pickup.lat;
        params.lng = pickup.lng;
      }
      const cond = CRITICAL_CONDITIONS.find(c => c.id === selectedConditionId);
      if (cond?.specialty) params.specialty = cond.specialty;
      else if (symptoms?.trim()) params.symptoms = symptoms.trim();

      const { data } = await api.get("/hospitals", { params });
      if (!ignore && data.hospitals?.length) {
        setHospitals(data.hospitals);
        if (!selectedHospitalId || !data.hospitals.some(h => (h._id || h.id) === selectedHospitalId)) {
          setSelectedHospitalId(data.hospitals[0]._id || data.hospitals[0].id);
        }
      }
    } catch {
      if (!ignore) {
        const cond = CRITICAL_CONDITIONS.find(c => c.id === selectedConditionId);
        const fallback = PREFETCHED_HOSPITALS.map(h => ({
          _id: h.id,
          id: h.id,
          name: h.name,
          specialties: [h.specialty],
          bedsAvailable: h.beds,
          distanceKm: cond?.hospitalName === h.name ? 2.4 : 5.8,
          matchesSpecialty: cond?.hospitalName === h.name || (h.conditionId === selectedConditionId),
        })).sort((a, b) => (b.matchesSpecialty ? 1 : 0) - (a.matchesSpecialty ? 1 : 0) || a.distanceKm - b.distanceKm);
        setHospitals(fallback);
        if (!selectedHospitalId) setSelectedHospitalId(fallback[0]?._id);
      }
    }
  }
  fetchNearestHospitals();
  return () => { ignore = true; };
 }, [pickup?.lat, pickup?.lng, selectedConditionId, symptoms]);
 function handleConditionChange(e){
  const condId=e.target.value;
  setSelectedConditionId(condId);
  const found=CRITICAL_CONDITIONS.find(c=>c.id===condId);
  if(found){
   setSymptoms(found.name);
   setNeeds(found.tier);
  }
 }
 const updatePickup=useCallback(async p=>{
  setPickup(p);
  const addr=await reverseGeocode(p.lat,p.lng);
  if(addr)setAddress(addr);
 },[]);
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
 async function locate(){
  if(busy||!!trip)return;
  setBusy(true);setError("");
  try{
   const loc=await detectLocation();
   setPickup({lat:loc.lat,lng:loc.lng});
   if(loc.address)setAddress(loc.address);
  }catch(e){
   setError(e.message||"Location sharing is unavailable. Drag the map pin to select pickup.");
  }finally{
   setBusy(false);
  }
 }
 async function submit(e){
  e.preventDefault();if(preview){navigate("/login");return}
  if(!pickup){setError("Share your location or drag the pickup pin before sending SOS.");return}
  const condition=CRITICAL_CONDITIONS.find(c=>c.id===selectedConditionId);
  const finalSymptoms=symptoms.trim()||condition?.name;
  if(!finalSymptoms){setError("Describe the symptoms or select a critical condition.");return}
  setBusy(true);setError("");
  try{
   const {data}=await api.post("/sos",{
    ...pickup,
    address,
    channel:"app",
    symptoms:[finalSymptoms],
    requestedAmbulanceTier:needs,
    requiredSpecialties:condition?[condition.specialty]:[],
    requiredEquipment:condition?condition.equipment:[],
    hospitalId: selectedHospitalId || undefined,
   });
   setTrip(data.trip);navigate("/trip/"+data.trip._id);
  }catch(e){setError(e.response?.data?.message||"Could not send SOS. Please try again or call 112.");}
  finally{setBusy(false)}
 }
 async function cancelRequest(){
  if(!trip?._id||busy)return;
  if(!window.confirm("Are you sure you want to cancel this ambulance request?"))return;
  setBusy(true);setError("");
  try{
   await api.patch(`/dispatch/trip/${trip._id}/status`,{status:"cancelled"});
   setTrip(prev=>prev?{...prev,status:"cancelled"}:null);
  }catch(e){setError(e.response?.data?.message||"Could not cancel ambulance request.");}
  finally{setBusy(false)}
 }
 const ambulance=trip?.ambulance,hospital=trip?.hospital;
 const stage=preview?2:({requested:0,offered:0,picked_up:2,arrived_hospital:3,matched:1,dispatched:1,en_route:2,arrived_pickup:2,en_route_hospital:3,handed_off:4}[trip?.status]??-1);
 const timeline=[
  ["SOS Received",preview?(currentCondition?.name || "Cardiac emergency (ALS)"):trip?trip.address||"Emergency request received":"Your request will appear here",trip?.createdAt],
  ["Ambulance Assigned",preview?`${assignedAmbulance.vehicleNumber} (${assignedAmbulance.tier}) · Driver: ${assignedAmbulance.driver}`:ambulance?.vehicleNumber||"Awaiting dispatcher assignment",trip?.dispatchedAt],
  ["Ambulance En Route",preview?`ETA: ${assignedAmbulance.etaMinutes} min · ${assignedAmbulance.distanceKm} km`:trip?.etaMinutes?("Estimated pickup: "+trip.etaMinutes+" min"):"ETA not yet available",null],
  [preview?"Hospital Confirmed":"Hospital destination",preview?`${currentCondition?.hospitalName || "AIIMS"} · ${currentCondition?.specialty || "Cardiac Care"}`:hospital?.name?hospital.name+" · confirmed":trip?.proposedHospital?.name?trip.proposedHospital.name+" · proposed":selectedHospital?.name?selectedHospital.name+" · selected destination":"Awaiting hospital selection",null],
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
    <div className="sahay-stepper">{["Share Location","Select Condition","Confirm Ambulance"].map((label,i)=><div key={label}><span className={(i===2?"current":"")}>{i+1}</span><strong>{label}</strong>{(preview|| (i===0&&pickup) || (i===1&&symptoms.trim()))&&i<2&&<CheckCircle2 className="sahay-green" size={18}/>}</div>)}</div>
    <div className="sahay-incident-map">
     <form className="sahay-card sahay-incident" onSubmit={submit}>
      <h2><ClipboardList/> Incident Details</h2>
      <label>Location (Pickup)<div className="sahay-input-icon"><MapPin size={19}/><input aria-label="Pickup address" value={trip?.address||address} disabled={!!trip} placeholder="Address or landmark" onChange={e=>setAddress(e.target.value)}/><button type="button" className="sahay-detect-btn" disabled={busy||!!trip} onClick={locate} aria-label="Detect location" title="Detect location"><LocateFixed size={16}/><span>{busy?"Detecting…":"Detect location"}</span></button></div></label>
      {pickup&&<span className="sahay-coordinates">{pickup.lat.toFixed(4)}, {pickup.lng.toFixed(4)} · pickup selected</span>}
      <label>Critical Medical Condition <b className="sahay-red">*</b>
       <select aria-label="Critical Condition" className="sahay-select" value={selectedConditionId} disabled={!!trip} onChange={handleConditionChange}>
        <option value="">-- Choose Critical Medical Condition --</option>
        {CRITICAL_CONDITIONS.map(c=><option key={c.id} value={c.id}>{c.name} ({c.tier})</option>)}
       </select>
      </label>
      {/* Destination Hospital Selection */}
      <div className="sahay-equipped-badge" style={{ marginTop: "10px" }}>
       <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
        <div className="sahay-equipped-row">
         <Building2 size={16}/>
         <span>Destination Hospital: <strong>{trip?.hospital?.name || selectedHospital?.name || currentCondition?.hospitalName || "AIIMS Apex Heart Institute"}</strong></span>
        </div>
        {selectedHospital?.distanceKm !== undefined && (
         <span style={{ fontSize: "11px", fontWeight: 700, color: "#166534", background: "#dcfce7", padding: "2px 8px", borderRadius: "9999px" }}>
          ★ {selectedHospital.distanceKm} km away
         </span>
        )}
       </div>
       <div className="sahay-equipped-row">
        <span>Specialty: <strong>{selectedHospital?.specialties?.join(", ") || selectedHospital?.specialty || currentCondition?.specialty || "Emergency Care"}</strong> · <strong>{selectedHospital?.bedsAvailable ?? selectedHospital?.beds ?? 8}</strong> beds ready</span>
       </div>
       {currentCondition && (
        <div className="sahay-equipped-row">
         <Ambulance size={16}/>
         <span>Pre-matched Unit: <strong>{assignedAmbulance.vehicleNumber} ({currentCondition.tier})</strong> · {currentCondition.equipment.slice(0,3).join(", ")}</span>
        </div>
       )}
       {!trip && hospitals.length > 0 && (
        <div style={{ marginTop: "6px", borderTop: "1px solid #bfdbfe80", paddingTop: "6px" }}>
         <label style={{ fontSize: "11px", fontWeight: 600, color: "#1e3a8a", display: "block", marginBottom: "4px" }}>
          Choose hospital (ranked by symptom match &amp; distance):
         </label>
         <select
          aria-label="Choose Hospital"
          className="sahay-select"
          style={{ margin: 0, padding: "6px 10px", fontSize: "12px", background: "#fff" }}
          value={selectedHospitalId}
          disabled={!!trip}
          onChange={e => setSelectedHospitalId(e.target.value)}
         >
          {hospitals.map((h, i) => (
           <option key={h._id || h.id} value={h._id || h.id}>
            {i === 0 ? "★ [Nearest Equipped] " : ""}{h.name} {h.distanceKm ? `· ${h.distanceKm} km` : ""} ({h.specialties?.join(", ") || h.specialty || "ER"} · {h.bedsAvailable ?? h.beds ?? 0} beds)
           </option>
          ))}
         </select>
        </div>
       )}
      </div>
      <label>Symptoms / Additional Notes
       <textarea aria-label="Symptoms" value={trip?(trip.symptoms?.join(", ")||trip.triage?.notes||"No symptom description recorded."):symptoms} onChange={e=>setSymptoms(e.target.value)} placeholder="Select condition from dropdown above or enter notes…" rows={2} disabled={!!trip}/>
      </label>
      <fieldset disabled={!!trip}><legend>Requested ambulance type</legend><div className="sahay-type-options">{["ALS","BLS"].map(type=><label key={type} className={(trip?.requestedAmbulanceTier||needs)===type?"checked":""}><input type="radio" name="ambulanceType" checked={(trip?.requestedAmbulanceTier||needs)===type} onChange={()=>setNeeds(type)}/>{type} ({type==="ALS"?"Advanced":"Basic"})</label>)}</div></fieldset>
      <p className="sahay-field-help">{trip?"Vehicle allocation and equipment are confirmed by dispatch.":"Preference for review. Dispatch determines the required vehicle and equipment."}</p>
      <button className="sahay-button dark sahay-confirm" type="submit" disabled={busy||!!trip||medical||!canRequest}>{!canRequest?"Patient account required":busy?"Please wait…":trip?"SOS request received":"Confirm & Send SOS"} {!trip&&<ArrowRight size={20}/>}</button>
      {trip && !["handed_off", "cancelled"].includes(trip.status) && (
        <button
          type="button"
          className="sahay-button sahay-cancel-btn"
          disabled={busy}
          onClick={cancelRequest}
          style={{ marginTop: "10px", width: "100%", background: "#fee2e2", color: "#b91c1c", border: "1px solid #fca5a5" }}
        >
          {busy ? "Cancelling…" : "✕ Cancel Ambulance Request"}
        </button>
      )}
      {trip?.status === "cancelled" && (
        <div style={{ marginTop: "10px", padding: "10px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "10px", textAlign: "center" }}>
          <p style={{ margin: 0, color: "#991b1b", fontSize: "13px", fontWeight: 650 }}>Ambulance request cancelled.</p>
          <button
            type="button"
            className="sahay-button dark"
            style={{ marginTop: "8px", width: "100%", fontSize: "13px" }}
            onClick={() => setTrip(null)}
          >
            Start New Emergency Request
          </button>
        </div>
      )}
      {trip&&<><Link to={"/trip/"+trip._id+"/details"} className="sahay-subtle-link">Trip controls &amp; messages →</Link><Link to="/patient/history" className="sahay-subtle-link">View your trip history</Link></>}
     </form>
     <JourneyMap preview={preview} trip={trip} pickup={pickup} onPickup={updatePickup}/>
    </div>
   </div>
   <aside className="sahay-case-column">
    <section className="sahay-card sahay-case-summary">
     <div><div><span className="sahay-muted">Case ID</span><h2>{preview?"SH-CARD-001":trip?trip._id:loading?"Loading…":"No active case"}</h2></div><span className="sahay-case-badge"><HeartPulse size={20}/>{preview?`${currentCondition?.tier || "ALS"} (${currentCondition?.category || "Cardiac"})`:ambulance?.tier||"SOS"}</span></div>
     <div className={"sahay-status "+(trip?.status==="cancelled"?"cancelled":"")}><span>i</span><b>Status:</b> {preview?"Ambulance En Route":loading?"Loading case…":statusLabels[trip?.status]||"Ready when you need help"}</div>
     {trip && !["handed_off", "cancelled"].includes(trip.status) && (
       <button
         type="button"
         disabled={busy}
         onClick={cancelRequest}
         style={{ marginTop: "10px", width: "100%", background: "#fff", color: "#dc2626", border: "1px solid #fca5a5", borderRadius: "8px", padding: "6px 12px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
       >
         {busy ? "Cancelling…" : "Cancel Ambulance Request"}
       </button>
     )}
    </section>
    <section className="sahay-card sahay-timeline"><h2><ClipboardList/> Response Timeline</h2><ol>{timeline.map(([title,description,at],i)=><li key={title} className={i<stage?"complete":i===stage?"current":""}><span className="sahay-timeline-node">{i<stage?<Check size={14}/>:null}</span><div><div><strong>{title}</strong><time>{preview?(i===0?"10:24 AM":i===1?"10:26 AM":i===2?"10:27 AM":"Pending"):time(at)}</time></div><p>{description}</p></div></li>)}</ol>{!preview&&<p className="sahay-timeline-foot">Updates refresh every 10 seconds. Pending milestones are not confirmations.</p>}</section>
    {trip && canRequest && <JourneyLog key={"log-" + trip._id} caseId={trip._id} />}
    {trip && canRequest && <CaregiverInvitations key={trip._id} tripId={trip._id} />}
   </aside>
  </div>
  <div className="sahay-summary-grid">
   <Summary icon={Ambulance} label="Ambulance" value={trip?ambulance?.vehicleNumber||"Awaiting assignment":preview?`${assignedAmbulance.vehicleNumber} (${assignedAmbulance.tier})`:"Awaiting assignment"}/>
   <Summary icon={Users} label="Crew" value={preview?`Driver: ${assignedAmbulance.driver} · EMT (Certified)`:ambulance?.crew?.map(c=>c.role+(c.certified?" ✓":"")).join(" + ")||"Not yet recorded"}/>
   <Summary icon={ClipboardList} label={preview?"Equipment (Equipped for case)":ambulance?.complianceVerified?"Equipment · compliance verified":"Equipment"} value={preview?currentCondition?.equipment?.join(" · ")||"Ventilator · Defibrillator · ECG · Oxygen":ambulance?.equipment?.join(" · ")||"Not yet recorded"} small/>
   <Summary icon={Building2} label={preview?"Equipped Hospital":hospital?.name||"Hospital destination"} value={hospital?.name||selectedHospital?.name||currentCondition?.hospitalName||"AIIMS Apex Heart Institute"}/>
   <Summary icon={Clock3} label={preview?"Sample ETA":"Estimated arrival"} value={preview?`${assignedAmbulance.etaMinutes} min (${assignedAmbulance.distanceKm} km)`:trip?.etaMinutes?trip.etaMinutes+" min":"Not available"}/>
  </div>
  <div className="sahay-fleet-accordion">
   <button type="button" className="sahay-fleet-toggle" onClick={()=>setShowFleet(!showFleet)}>
    <span><strong>Pre-Fetched Standby Network:</strong> 10 Verified Ambulances &amp; 15 Condition-Equipped Hospitals</span>
    <small>{showFleet?"▲ Hide Network":"▼ View 10 Ambulances & 15 Hospitals"}</small>
   </button>
   {showFleet&&(
    <div className="sahay-fleet-list">
     {PREFETCHED_HOSPITALS.map(h=><div key={h.id} className="sahay-fleet-item"><strong>🏥 {h.name}</strong><span>Equipped for: {h.specialty} · {h.beds} beds ready</span></div>)}
     {PREFETCHED_AMBULANCES.map(a=><div key={a.id} className="sahay-fleet-item"><strong>🚑 {a.vehicleNumber} ({a.tier})</strong><span>Driver: {a.driver} · ETA: {a.etaMinutes} min · Status: Ready</span></div>)}
    </div>
   )}
  </div>
  <footer className="sahay-workspace-footer"><span><ShieldCheck size={15}/> Synthetic prototype · call <a href="tel:112">112</a> for emergency assistance</span><span>{preview?"Preview data only":trip?.ambulance?.lastPingAt?"GPS last seen "+time(trip.ambulance.lastPingAt):"GPS timestamp not available"}</span></footer>
 </div>
}
function Summary({icon:Icon,label,value,small}){return <section className="sahay-card sahay-summary"><Icon/><div><span>{label}</span><strong className={small?"small":""}>{value}</strong></div></section>}
