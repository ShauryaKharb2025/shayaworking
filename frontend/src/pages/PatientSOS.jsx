import CaseCarePanel from "../components/CaseCarePanel";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../api/axios";
import { connectSocket } from "../api/socket";
import { useAuth } from "../context/AuthContext";
import { JourneyLog, SpecialistBooking } from "../components/CaseWorkflow";
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
 const [addressResults,setAddressResults]=useState([]);
 const [locationConfirmed,setLocationConfirmed]=useState(false),[processing,setProcessing]=useState(false);
 const requestGeneration=useRef(0),locationGeneration=useRef(0);
 function invalidateLocation(){
  locationGeneration.current+=1;setLocationConfirmed(false);setSelectedConditionId("");setSymptoms("");setNeeds("ALS");
 }
 function clearQuery(){
  invalidateLocation();setAddress("");setPickup(null);setAddressResults([]);setError("");setMedical(false);
 }
 async function resetRequest(){
  setBusy(true);setError("");
  try{
   if(trip && !["cancelled","handed_off"].includes(trip.status)){
    await api.patch("/dispatch/trip/"+trip._id+"/status",{status:"cancelled"});
   }
   requestGeneration.current+=1;
   setTrip(null);clearQuery();navigate("/sos");
  }catch(err){setError(err.response?.data?.message||"Could not reset the current request. Please retry.");}
  finally{setBusy(false);}
 }
 async function confirmLocation(){
  setError("");
  if(pickup){setLocationConfirmed(true);return;}
  if(!address.trim()){setError("Enter an address, detect location, or select a pickup pin first.");return;}
  setBusy(true);
  const generation=locationGeneration.current;
  try{
   const {data}=await api.get("/location/search",{params:{q:address.trim()}});
   if(generation!==locationGeneration.current)return;
   if(!data.results?.length)throw new Error();
   setAddressResults(data.results);
   setError("Choose the matching address, check its map pin, then confirm location.");
  }catch{setError("Could not resolve this address. Select the pickup pin on the map.");}
  finally{setBusy(false);}
 }
 const currentCondition=CRITICAL_CONDITIONS.find(c=>c.id===selectedConditionId)||(preview?CRITICAL_CONDITIONS[0]:null);
 const assignedAmbulance=PREFETCHED_AMBULANCES.find(a=>currentCondition?a.tier===currentCondition.tier:true)||PREFETCHED_AMBULANCES[0];
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
  invalidateLocation();setPickup(p);
  const generation=locationGeneration.current;
  const addr=await reverseGeocode(p.lat,p.lng);
  if(addr && generation===locationGeneration.current)setAddress(addr);
 },[]);
 const load=useCallback(async()=>{
  if(!user || !canRequest){setLoading(false);return}
  const generation=requestGeneration.current;
  try {
   let selected;
   if(id) selected=(await api.get("/sos/"+id)).data.trip;
   else {
    const rows=(await api.get("/sos")).data.trips||[];
    selected=rows.find(t=>!["handed_off","cancelled"].includes(t.status));
    if(selected)selected=(await api.get("/sos/"+selected._id)).data.trip;
   }
   if(generation===requestGeneration.current){setTrip(selected||null);setError("");}
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
  const locationUpdate = event => {
   if (event?.tripId !== tripId || !Number.isFinite(event.lat) || !Number.isFinite(event.lng)) return;
   setTrip(current => current?.ambulance ? { ...current, ambulance: {
    ...current.ambulance, location: { type: "Point", coordinates: [event.lng, event.lat] },
    lastPingAt: new Date().toISOString(),
   } } : current);
  };
  socket.on("trip:location", locationUpdate);
  socket.on("connect", join);
  for (const name of ["case:refresh", "trip:status"]) socket.on(name, refresh);
  return () => {
   socket.off("connect", join);
   socket.off("trip:location", locationUpdate);
   socket.emit("leave:trip", tripId);
   for (const name of ["case:refresh", "trip:status"]) socket.off(name, refresh);
  };
 }, [trip?._id, user, canRequest, load]);
 async function locate(){
  if(busy||!!trip)return;
  setBusy(true);setError("");
  try{
   invalidateLocation();
   const generation=locationGeneration.current;
   const loc=await detectLocation();
   if(generation!==locationGeneration.current)return;
   setPickup({lat:loc.lat,lng:loc.lng,accuracy:loc.accuracy});
   if(loc.address)setAddress(loc.address);
  }catch(e){
   setError(e.message||"Location sharing is unavailable. Drag the map pin to select pickup.");
  }finally{
   setBusy(false);
  }
 }
 async function submit(e){
  e.preventDefault();if(preview){navigate("/login");return}
  if(busy || trip)return;
  if(!pickup || !locationConfirmed){setError("Confirm your pickup location before selecting the condition and sending SOS.");return;}
  if(!selectedConditionId){setError("Select a critical condition before processing the request.");return;}
  const confirmedPickup=pickup;
  const condition=CRITICAL_CONDITIONS.find(c=>c.id===selectedConditionId);
  if(!condition){setError("Select a valid critical condition.");return;}
  const finalSymptoms=symptoms.trim()||condition.name;
  if(!finalSymptoms){setError("Describe the symptoms or select a critical condition.");return}
  setBusy(true);setProcessing(true);setError("");
  requestGeneration.current+=1;
  try{
   const processingStarted = Date.now();
   const {data}=await api.post("/sos",{
    ...confirmedPickup,
    address,
    channel:"app",
    symptoms:finalSymptoms===condition.name?[finalSymptoms]:[condition.name,finalSymptoms],
    requestedAmbulanceTier:needs,
    requiredSpecialties:condition?[condition.specialty]:[],
    requiredEquipment:condition?condition.equipment:[],
   });
   await new Promise(resolve => setTimeout(resolve, Math.max(0, 2500 - (Date.now() - processingStarted))));
   setTrip(data.trip);clearQuery();navigate("/trip/"+data.trip._id);
  }catch(e){setError(e.response?.data?.message||"Could not send SOS. Please try again or call 112.");}
  finally{setBusy(false);setProcessing(false)}
 }
 const ambulance=trip?.ambulance,hospital=trip?.hospital;
 const formStep=trip?2:!locationConfirmed?0:!selectedConditionId?1:2;
 const stage=preview?2:({requested:0,offered:0,picked_up:4,arrived_hospital:4,matched:1,dispatched:1,en_route:2,arrived_pickup:2,en_route_hospital:4,handed_off:5}[trip?.status]??-1);
 const timeline=[
  ["SOS Received",preview?(currentCondition?.name || "Cardiac emergency (ALS)"):trip?trip.address||"Emergency request received":"Your request will appear here",trip?.createdAt],
  ["Ambulance Assigned",preview?`${assignedAmbulance.vehicleNumber} (${assignedAmbulance.tier}) · Driver: ${assignedAmbulance.driver}`:ambulance?.vehicleNumber||"Finding nearest equipped ambulance",trip?.dispatchedAt],
  ["Ambulance En Route",preview?`ETA: ${assignedAmbulance.etaMinutes} min · ${assignedAmbulance.distanceKm} km`:trip?.etaMinutes?("Estimated pickup: "+trip.etaMinutes+" min"):"ETA not yet available",null],
  ["Patient picked up", trip?.events?.some(event=>event.type==="status:picked_up") ? "Pickup confirmed by the ambulance crew · care assessment underway" : "Awaiting crew pickup confirmation", trip?.events?.find(event=>event.type==="status:picked_up")?.at],
  [preview?"Hospital Confirmed":"Hospital destination",preview?`${currentCondition?.hospitalName || "AIIMS"} · ${currentCondition?.specialty || "Cardiac Care"}`:hospital?.name?hospital.name+" · confirmed":trip?.proposedHospital?.name?trip.proposedHospital.name+" · proposed":"Awaiting hospital selection",null],
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
    <div className="sahay-stepper">{["Share Location","Select Condition","Confirm Ambulance"].map((label,i)=><div key={label}><span className={(i===formStep?"current":"")}>{i+1}</span><strong>{label}</strong>{(preview|| !!trip || (i===0&&locationConfirmed) || (i===1&&symptoms.trim()))&&i<2&&<CheckCircle2 className="sahay-green" size={18}/>}</div>)}</div>
    <div className="sahay-incident-map">
     <form className="sahay-card sahay-incident" onSubmit={submit}>
      <h2><ClipboardList/> Incident Details</h2>
      <label>Location (Pickup)<div className="sahay-input-icon"><MapPin size={19}/><input aria-label="Pickup address" value={trip?.address||address} disabled={!!trip} placeholder="Address or landmark" onChange={e=>{invalidateLocation();setAddress(e.target.value);setPickup(null);setAddressResults([])}}/><button type="button" className="sahay-detect-btn" disabled={busy||!!trip} onClick={locate} aria-label="Detect location" title="Detect location"><LocateFixed size={16}/><span>{busy?"Detecting…":"Detect location"}</span></button></div></label>
      {addressResults.length > 0 && <div aria-label="Matching pickup addresses">{addressResults.map((result,index)=><button className="sahay-subtle-link" type="button" key={index} onClick={()=>{invalidateLocation();setPickup({lat:result.lat,lng:result.lng});setAddress(result.address);setAddressResults([]);setError("");}}>{result.address}</button>)}</div>}
      {pickup&&<span className="sahay-coordinates">{pickup.lat.toFixed(4)}, {pickup.lng.toFixed(4)} · pickup selected{pickup.accuracy ? " · GPS accuracy ±" + Math.round(pickup.accuracy) + " m" : ""}</span>}
      {!trip && <button type="button" className="sahay-button" disabled={busy||locationConfirmed} onClick={confirmLocation}>{locationConfirmed?"Location confirmed":"Confirm location"}</button>}
      {!trip && !locationConfirmed && <p className="sahay-field-help">Confirm the pickup address and map pin to unlock condition selection.</p>}
      <label>Critical Medical Condition <b className="sahay-red">*</b>
       <select aria-label="Critical Condition" className="sahay-select" value={trip ? CRITICAL_CONDITIONS.find(condition=>trip.symptoms?.includes(condition.name))?.id||"" : selectedConditionId} disabled={!!trip||busy||(!preview&&!locationConfirmed)} onChange={handleConditionChange}>
        <option value="">-- Choose Critical Medical Condition --</option>
        {CRITICAL_CONDITIONS.map(c=><option key={c.id} value={c.id}>{c.name} ({c.tier})</option>)}
       </select>
      </label>
      {currentCondition && <p className="sahay-field-help">Requires {currentCondition.tier} with {currentCondition.equipment.join(", ")}. Matching begins after you confirm the pickup and send SOS.</p>}
      {busy && <div className="sahay-equipped-badge" role="status" aria-live="polite">{processing ? "Processing pickup and care requirements. Checking available equipped ambulances and nearby specialist hospitals…" : "Resolving pickup location…"}</div>}
      <label>Symptoms / Additional Notes
       <textarea aria-label="Symptoms" value={trip?(trip.symptoms?.join(", ")||trip.triage?.notes||"No symptom description recorded."):symptoms} onChange={e=>setSymptoms(e.target.value)} placeholder="Select condition from dropdown above or enter notes…" rows={2} disabled={!!trip || (!preview&&!locationConfirmed)}/>
      </label>
      <fieldset disabled={!!trip||(!preview&&!locationConfirmed)}><legend>Requested ambulance type</legend><div className="sahay-type-options">{["ALS","BLS"].map(type=><label key={type} className={(trip?.requestedAmbulanceTier||needs)===type?"checked":""}><input type="radio" name="ambulanceType" checked={(trip?.requestedAmbulanceTier||needs)===type} onChange={()=>setNeeds(type)}/>{type} ({type==="ALS"?"Advanced":"Basic"})</label>)}</div></fieldset>
      <p className="sahay-field-help">{trip?"The nearest available equipped ambulance is offered the pickup automatically.":"Matching checks required equipment, certified crew, availability and distance from pickup."}</p>
      <button className="sahay-button dark sahay-confirm" type="submit" disabled={busy||!!trip||medical||!canRequest||(!preview&&(!locationConfirmed||!selectedConditionId))}>{!canRequest?"Patient account required":busy?"Please wait…":trip?"SOS request received":"Confirm & Send SOS"} {!trip&&<ArrowRight size={20}/>}</button>
      {trip&&<button type="button" className="sahay-button" disabled={busy} onClick={resetRequest}>{["handed_off","cancelled"].includes(trip.status)?"Start a new request":"Cancel current & start new request"}</button>}
      {trip&&<><Link to={"/trip/"+trip._id+"/details"} className="sahay-subtle-link">Trip controls &amp; messages →</Link><Link to="/patient/history" className="sahay-subtle-link">View your trip history</Link></>}
     </form>
     <div className="sahay-map-column">
     {trip && ["picked_up","en_route_hospital","arrived_hospital"].includes(trip.status) && <section className="sahay-card sahay-transport-summary" aria-label="Hospital transport">
      <h2>{trip.status==="arrived_hospital" ? "Arrived at hospital" : trip.status==="en_route_hospital" ? "Your ambulance is travelling to hospital" : "Pickup confirmed · hospital journey next"}</h2>
      <p>{trip.hospital?.name || trip.proposedHospital?.name || "Awaiting hospital selection"}</p>
      <p>{trip.status==="en_route_hospital" ? "Follow the moving ambulance and remaining blue route on the map." : trip.status==="picked_up" ? trip.hospital ? "Waiting for your driver to start the hospital route." : "Waiting for the selected hospital to accept the receiving request." : "Hospital arrival recorded."}</p>
     </section>}
     <JourneyMap preview={preview} trip={trip} pickup={pickup} onPickup={updatePickup}/>
     </div>
    </div>
    {trip && <CaseCarePanel key={trip._id} caseId={trip._id}/>}
   </div>
   <aside className="sahay-case-column">
    <section className="sahay-card sahay-case-summary"><div><div><span className="sahay-muted">Case ID</span><h2>{preview?"SH-CARD-001":trip?trip._id:loading?"Loading…":"No active case"}</h2></div><span className="sahay-case-badge"><HeartPulse size={20}/>{preview?`${currentCondition?.tier || "ALS"} (${currentCondition?.category || "Cardiac"})`:ambulance?.tier||"SOS"}</span></div><div className={"sahay-status "+(trip?.status==="cancelled"?"cancelled":"")}><span>i</span><b>Status:</b> {preview?"Ambulance En Route":loading?"Loading case…":statusLabels[trip?.status]||"Ready when you need help"}</div></section>
    <section className="sahay-card sahay-timeline"><h2><ClipboardList/> Response Timeline</h2><ol>{timeline.map(([title,description,at],i)=><li key={title} className={i<stage?"complete":i===stage?"current":""}><span className="sahay-timeline-node">{i<stage?<Check size={14}/>:null}</span><div><div><strong>{title}</strong><time>{preview?(i===0?"10:24 AM":i===1?"10:26 AM":i===2?"10:27 AM":"Pending"):time(at)}</time></div><p>{description}</p></div></li>)}</ol>{!preview&&<p className="sahay-timeline-foot">Updates refresh every 10 seconds. Pending milestones are not confirmations.</p>}</section>
    {trip && <SpecialistBooking caseId={trip._id}/>}
    {trip && canRequest && <JourneyLog key={"log-" + trip._id} caseId={trip._id} />}
   </aside>
  </div>
  <div className="sahay-summary-grid">
   <section className="sahay-card sahay-summary"><Ambulance/><div>
    <span>Allocated ambulance &amp; driver</span>
    <strong>{ambulance ? ambulance.vehicleNumber + " (" + ambulance.tier + ")" : preview ? assignedAmbulance.vehicleNumber + " (" + assignedAmbulance.tier + ")" : "Finding nearest equipped ambulance"}</strong>
    <p>{ambulance?.driver?.name || (preview ? assignedAmbulance.driver : "Awaiting an available driver")}</p>
    {ambulance?.driver?.phone && <a href={"tel:"+ambulance.driver.phone}>Call driver · {ambulance.driver.phone}</a>}
   </div></section>
   <Summary icon={Users} label="Crew" value={preview?`Driver: ${assignedAmbulance.driver} · EMT (Certified)`:ambulance?.crew?.map(c=>c.role+(c.certified?" ✓":"")).join(" + ")||"Not yet recorded"}/>
   <Summary icon={ClipboardList} label={preview?"Equipment (Equipped for case)":ambulance?.complianceVerified?"Equipment · compliance verified":"Equipment"} value={preview?currentCondition?.equipment?.join(" · ")||"Ventilator · Defibrillator · ECG · Oxygen":ambulance?.equipment?.join(" · ")||"Not yet recorded"} small/>
   <Summary icon={Building2} label={preview?"Equipped Hospital":hospital?.name||"Hospital destination"} value={preview?currentCondition?.hospitalName||"AIIMS Apex Heart Institute":hospital?.name||(trip?.proposedHospital?.name ? trip.proposedHospital.name+" · receiving request pending" : "Selecting emergency-capable hospital")}/>
   <Summary icon={Clock3} label={preview?"Sample ETA":"Estimated arrival"} value={preview?`${assignedAmbulance.etaMinutes} min (${assignedAmbulance.distanceKm} km)`:trip?.etaMinutes?trip.etaMinutes+" min · "+(trip.status==="en_route_hospital"?"to hospital":"to pickup"):"Not available"}/>
  </div>
  {preview && <div className="sahay-fleet-accordion">
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
  </div>}
  <footer className="sahay-workspace-footer"><span><ShieldCheck size={15}/> Synthetic prototype · call <a href="tel:112">112</a> for emergency assistance</span><span>{preview?"Preview data only":trip?.ambulance?.lastPingAt?"GPS last seen "+time(trip.ambulance.lastPingAt):"GPS timestamp not available"}</span></footer>
 </div>
}
function Summary({icon:Icon,label,value,small}){return <section className="sahay-card sahay-summary"><Icon/><div><span>{label}</span><strong className={small?"small":""}>{value}</strong></div></section>}
