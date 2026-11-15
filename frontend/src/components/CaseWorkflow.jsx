import { useCaseResource } from "../hooks/useCaseResource";
import CaseCarePanel from "./CaseCarePanel";
import { useEffect, useState } from "react";
import api from "../api/axios";
import { connectSocket } from "../api/socket";

export { useCaseResource } from "../hooks/useCaseResource";

function useAction(reload) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function run(method, path, body) {
    setError("");
    setPending(true);
    try {
      const response = await api[method](path, body);
      await reload();
      return response.data;
    } catch (err) {
      setError(err.response?.data?.message || "Could not save the change.");
    } finally {
      setPending(false);
    }
  }
  return { error, pending, run };
}

const coordinationLabels = {
  finding_ambulance: "Finding an available ambulance",
  review_availability: "Reviewing fleet availability",
  awaiting_driver: "Awaiting driver acknowledgement",
  monitor_acknowledgement: "Monitoring the dispatch offer",
  preparing_pickup: "Preparing for pickup",
  monitor_pickup: "Ambulance travelling to pickup",
  review_pickup_eta: "Reviewing the estimated pickup time",
  awaiting_pickup: "Ambulance at pickup",
  prepare_transport: "Preparing for transport",
  monitor_transport: "Travelling to the receiving hospital",
  awaiting_handoff: "Awaiting hospital handoff",
  handoff_recorded: "Hospital handoff recorded",
  case_cancelled: "Emergency request cancelled",
};

function eventLabel(type) {
  const labels = {
    "sos:received": "Emergency request received",
    "ambulance:auto_offered": "Recommended ambulance offered to driver",
    "ambulance:offer_expired": "Driver acknowledgement window expired",
    "hospital:automatically_proposed": "Recommended hospital sent a receiving request",
    "hospital:referral_expired": "Hospital acknowledgement window expired",
    "hospital:referral_unavailable": "Hospital referral withdrawn after availability changed",
    "status:dispatched": "Driver accepted the offer",
  };
  return labels[type] || (type ? type.replace(/^(status:|observation:)/, "").replace(/[:_]/g, " ") : "");
}

export function JourneyLog({ caseId }) {
  const { data, error, load } = useCaseResource(`/cases/${caseId}/journey`, 4000);
  useEffect(() => {
    const socket = connectSocket();
    const refresh = event => { if (event?.tripId === caseId) load(); };
    socket.on("case:refresh", refresh);
    socket.on("trip:status", refresh);
    return () => {
      socket.off("case:refresh", refresh);
      socket.off("trip:status", refresh);
    };
  }, [caseId, load]);
  if (error) return <p role="alert">{error}</p>;
  if (!data) return <p role="status">Loading emergency activity…</p>;
  const list = events => <ol className="space-y-1">{events.map(row => <li key={row.id}>
    <time dateTime={row.at}>{new Date(row.at).toLocaleString()}</time> · {eventLabel(row.type)}
  </li>)}</ol>;
  return <section className="my-4 rounded-xl border p-4">
    <h2>Emergency journey and logs</h2>
    <p>{coordinationLabels[data.coordination] || eventLabel(data.status)}</p>
    {data.highlights.length > 0 && <>
      <h3>{data.status === "handed_off" ? "Final case summary" : "Journey highlights"}</h3>
      {list(data.highlights)}
    </>}
    <details><summary>Recorded activity</summary>{list(data.events)}</details>
    <h3>Treatment observations</h3>
    {data.observations.length === 0 ? <p>No treatment information has been recorded yet.</p> :
      <ul>{data.observations.map(row => <li key={row.id}>
        <time dateTime={row.createdAt}>{new Date(row.createdAt).toLocaleString()}</time> · {eventLabel(row.type)} · {row.note}
      </li>)}</ul>}
  </section>;
}

export function DispatchCaseOperations({ trips }) {
  const [selection, setSelection] = useState("");
  return <section className="my-4 rounded-xl border p-4">
    <label>Emergency case <select value={selection} onChange={event => setSelection(event.target.value)}>
      <option value="">Select a case</option>
      {trips.map(row => <option key={row._id} value={row._id}>{row.patient?.name || row._id}</option>)}
    </select></label>
    {selection && <><Destinations key={selection} tripId={selection} /><JourneyLog key={"log-" + selection} caseId={selection} /></>}
  </section>;
}

export function Destinations({ tripId }) {
  const path = `/cases/${tripId}`;
  const resource = useCaseResource(path + "/destinations", 6000);
  const action = useAction(resource.load);
  const data = resource.data;
  return <section className="my-4 rounded-xl border p-4">
    <h3>Hospital referrals</h3>
    {(resource.error || action.error) && <p role="alert">{resource.error || action.error}</p>}
    {!data && !resource.error && <p role="status">Loading hospitals…</p>}
    {data && <>
      <p>Confirmed destination {data.confirmed?.name || "pending"}</p>
      {data.referrals.map(referral => <div key={referral.id}>
        {referral.hospital.name} · {referral.status}
        {referral.status === "accepted" && <button disabled={action.pending} onClick={() =>
          action.run("patch", path + "/referrals/" + referral.id, { action: "confirmed" })}>Approve destination</button>}
        {["proposed", "accepted"].includes(referral.status) && <button disabled={action.pending} onClick={() =>
          action.run("patch", path + "/referrals/" + referral.id, { action: "withdrawn" })}>Withdraw referral</button>}
      </div>)}
      {(() => {
        const nearestEligible = data.hospitals.find(h => h.eligible && data.confirmed?.id !== h.id);
        if (!nearestEligible) return null;
        return (
          <div style={{ margin: "10px 0", padding: "10px", borderRadius: "8px", background: "#f0fdf4", border: "1px solid #bbf7d0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#166534" }}>★ Nearest Equipped Hospital:</span>
              <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#15803d" }}>
                {nearestEligible.label} · {nearestEligible.distanceKm} km · {nearestEligible.bedsAvailable} beds ready
              </p>
            </div>
            <button
              disabled={action.pending}
              style={{ background: "#16a34a", color: "#fff", border: 0, padding: "5px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 650, cursor: "pointer" }}
              onClick={() => action.run("post", path + "/referrals", { hospitalId: nearestEligible.id })}
            >
              Choose Nearest
            </button>
          </div>
        );
      })()}
      {data.hospitals.map(hospital => <div key={hospital.id}>
        {hospital.label} · {hospital.distanceKm} km · {hospital.bedsAvailable} free beds · {hospital.specialties.join(", ")}
        <button disabled={action.pending || !hospital.eligible || data.confirmed?.id === hospital.id} onClick={() =>
          action.run("post", path + "/referrals", { hospitalId: hospital.id })}>Send referral</button>
      </div>)}
    </>}
  </section>;
}

export function HospitalReferrals() {
  const resource = useCaseResource("/cases/hospital/referrals", 6000);
  const action = useAction(resource.load);
  const [urgencyFilter,setUrgencyFilter]=useState("");
  const priority={critical:0,urgent:1,standard:2,unassessed:3};
  const rows=[...(resource.data?.referrals || [])].filter(row=>!urgencyFilter || (row.trip.careDetails?.preparation?.urgency || "unassessed")===urgencyFilter)
    .sort((a,b)=>(priority[a.trip.careDetails?.preparation?.urgency]??3)-(priority[b.trip.careDetails?.preparation?.urgency]??3) || (new Date(a.trip.careDetails?.preparation?.expectedArrival || 8640000000000000).getTime())-(new Date(b.trip.careDetails?.preparation?.expectedArrival || 8640000000000000).getTime()) || (a.trip.etaMinutes??Infinity)-(b.trip.etaMinutes??Infinity));
  return <section className="my-6 rounded-xl border p-4">
    <h2>Emergency receiving requests and handoff</h2>
    {(resource.error || action.error) && <p role="alert">{resource.error || action.error}</p>}
    {resource.data?.referrals.length === 0 && <p>No active referrals.</p>}
    <label>Recorded urgency <select value={urgencyFilter} onChange={event=>setUrgencyFilter(event.target.value)}><option value="">All incoming cases</option>{["critical","urgent","standard","unassessed"].map(value=><option key={value} value={value}>{value}</option>)}</select></label>
    {resource.data && !rows.length && resource.data.referrals.length>0 && <p>No cases match the selected urgency.</p>}
    {rows.map(row => <div key={row.id} className="sahay-referral-card">
      <p>Recorded urgency · {row.trip.careDetails?.preparation?.urgency || "Unassessed"}</p>
      {row.trip.status==="en_route_hospital" && row.trip.careDetails?.preparation?.expectedArrival && new Date(row.trip.careDetails.preparation.expectedArrival)<new Date() && <p role="status">Expected arrival passed · review ETA</p>}
      <details><summary>Patient on-way health logs and hospital preparation</summary><CaseCarePanel caseId={row.tripId}/></details>
      <p className="font-semibold">Receiving hospital · {row.hospital?.name || "Selected destination"}</p>
      <p>Case {row.tripId} · {row.status} · {row.trip.status.replaceAll("_", " ")}</p>
      <p>Emergency · {row.trip.symptoms?.join(", ") || "Awaiting clinical details"}</p>
      <p>Required specialties · {row.trip.triage?.requiredSpecialties?.join(", ") || "Emergency assessment"}</p>
      <p>Pickup · {row.trip.address || "Coordinates recorded"} · Ambulance · {row.trip.ambulance?.vehicleNumber || "Being matched"}</p>
      <p>{["arrived_hospital","handed_off"].includes(row.trip.status) ? "Hospital arrival recorded" : (row.trip.status==="en_route_hospital" ? "Hospital arrival ETA" : "Pickup ETA")+" · "+(row.trip.etaMinutes!=null ? row.trip.etaMinutes+" min" : "unavailable")}</p>
      {row.status === "proposed" && ["accepted", "rejected"].map(status =>
        <button key={status} disabled={action.pending} onClick={() =>
          action.run("patch", `/cases/${row.tripId}/referrals/${row.id}`, { action: status })}>
          {status === "accepted" ? "Accept incoming patient" : "Decline receiving request"}
        </button>)}
      {row.status === "confirmed" && <>
        <SpecialistBooking caseId={row.tripId}/>
        <HospitalSpecialistAvailability hospitalId={row.hospitalId} specialty={row.trip.triage?.requiredSpecialties?.[0] || ""}/>
        <details><summary>Record a clinical or procedure update</summary><ClinicalObservations caseId={row.tripId}/></details>
      </>}
      {row.status === "confirmed" && <details><summary>Emergency activity log</summary><JourneyLog caseId={row.tripId} /></details>}
      {row.status === "confirmed" && row.trip.status === "arrived_hospital" &&
        <button disabled={action.pending} onClick={() =>
          action.run("patch", `/dispatch/trip/${row.tripId}/status`, { status: "handed_off" })}>Record handoff</button>}
    </div>)}
  </section>;
}

export function CaregiverInvitations({ tripId }) {
  const path = `/cases/${tripId}/invitations`;
  const resource = useCaseResource(path);
  const action = useAction(resource.load);
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  return <section className="sahay-card sahay-timeline">
    <h2>Family access</h2>
    <form onSubmit={async event => {
      event.preventDefault();
      setToken((await action.run("post", path, { email }))?.token || "");
    }}>
      <label>Caregiver email <input type="email" required value={email} onChange={event => setEmail(event.target.value)} /></label>
      <button disabled={action.pending}>Create invitation</button>
    </form>
    {token && <p>Share this code privately. It expires in 15 minutes. <code style={{ overflowWrap: "anywhere" }}>{token}</code></p>}
    {(resource.error || action.error) && <p role="alert">{resource.error || action.error}</p>}
    {resource.data?.invitations?.map(invitation => <p key={invitation.id}>{invitation.email} ·
      {invitation.revokedAt ? " Revoked" : new Date(invitation.expiresAt) <= new Date() ? " Expired" :
        <button disabled={action.pending} onClick={() => { setToken(""); action.run("delete", path + "/" + invitation.id); }}>Revoke</button>}
    </p>)}
  </section>;
}

export function CaregiverDashboard() {
  const grants = useCaseResource("/cases/caregiver/cases", 8000);
  const action = useAction(grants.load);
  const [token, setToken] = useState("");
  const [caseId, setCaseId] = useState("");
  return <main className="mx-auto max-w-4xl space-y-4 p-6">
    <h1>Caregiver journey</h1>
    <form onSubmit={async event => {
      event.preventDefault();
      const result = await action.run("post", "/cases/caregiver/redeem", { token: token.trim() });
      if (result) { setCaseId(result.tripId); setToken(""); }
    }}>
      <label>Invitation code <input required value={token} onChange={event => setToken(event.target.value)} /></label>
      <button disabled={action.pending}>Verify invitation</button>
    </form>
    {(grants.error || action.error) && <p role="alert">{grants.error || action.error}</p>}
    <label>Case <select value={caseId} onChange={event => setCaseId(event.target.value)}>
      <option value="">Select case</option>
      {grants.data?.grants.map(({ tripId }) => <option key={tripId}>{tripId}</option>)}
    </select></label>
    {caseId && <FamilyJourney key={caseId} caseId={caseId} />}
  </main>;
}

function FamilyJourney({ caseId }) {
  const path = `/cases/${caseId}/caregiver`;
  const { data, error } = useCaseResource(path, 6000);
  if (error) return <p role="alert">{error}</p>;
  if (!data) return <p role="status">Loading journey…</p>;
  const coordinates = data.ambulance?.location?.coordinates;
  return <section className="space-y-2 rounded-xl border p-4">
    <p>Status {data.status.replaceAll("_", " ")}</p>
    <p>Simulated ETA {data.simulatedEtaMinutes ?? "unavailable"}</p>
    <p>Proposed hospital {data.proposed || "pending"}</p>
    <p>Confirmed hospital {data.confirmed || "pending"}</p>
    {data.ambulance && <>
      <p>Ambulance {data.ambulance.vehicleNumber} · {data.ambulance.complianceVerified ? "Compliance verified" : "Verification pending"}</p>
      <p>Equipment {data.ambulance.equipment.join(", ")}</p>
      <p>Crew {data.ambulance.crew.map(row => row.role + (row.certified ? " (certified)" : "")).join(", ")}</p>
      {coordinates && <p>Last location {coordinates[1]}, {coordinates[0]}</p>}
    </>}
    <JourneyLog caseId={caseId} />
  </section>;
}

export function ClinicalObservations({ caseId }) {
  const path = `/cases/${caseId}/observations`;
  const resource = useCaseResource(path);
  const action = useAction(resource.load);
  const [type, setType] = useState("assessment");
  const [note, setNote] = useState("");

  return <section className="my-4 rounded-xl border p-4">
    <h2>Assessment, operation plan and treatment updates</h2>
    <p>Record care actually provided under the treating clinician’s protocol, including medication, dose, time and response when applicable.</p>
    {(resource.error || action.error) && <p role="alert">{resource.error || action.error}</p>}
    {resource.data && <>
      <form className="grid gap-2" onSubmit={async event => {
        event.preventDefault();
        if (await action.run("post", path, { type, note })) setNote("");
      }}>
        <label>Observation type <select value={type} onChange={event => setType(event.target.value)}>
          <option value="assessment">Assessment</option><option value="vitals">Vitals</option>
          <option value="intervention_observed">Observed intervention</option>
          <option value="operation_plan">Operation / procedure plan</option><option value="procedure_update">Procedure progress update</option>
          <option value="equipment_used">Equipment used</option><option value="handoff_observation">Handoff observation</option>
        </select></label>
        <label>Observation <textarea required value={note} maxLength={2000} onChange={event => setNote(event.target.value)} /></label>
        <button disabled={action.pending}>Record observation</button>
      </form>
      <ul>{resource.data.observations.map(row => <li key={row.id}>{new Date(row.createdAt).toLocaleString()} · {row.type} · {row.note} · {row.actorId}</li>)}</ul>
    </>}
  </section>;
}

export function ClinicianDashboard() {
  const queue = useCaseResource("/cases/clinician/queue", 5000);
  const [draft, setDraft] = useState("");
  const [caseId, setCaseId] = useState("");
  return <main className="mx-auto max-w-4xl p-6">
    <h1>Clinician dashboard</h1>
    <SpecialistAvailability/>
    <section className="my-4 rounded-xl border p-4"><h2>Assigned patient check-ups</h2>
     {queue.error && <p role="alert">{queue.error}</p>}
     {queue.data?.cases.length === 0 && <p>No assigned check-ups.</p>}
     {queue.data?.cases.map(row=><button className="block py-2 text-left" key={row.id} onClick={()=>setCaseId(row.id)}>
      {row.patient} · {row.specialty} · {new Date(row.startsAt).toLocaleString()} · {row.status.replaceAll("_"," ")}
     </button>)}
    </section>
    <form onSubmit={event => { event.preventDefault(); setCaseId(draft.trim()); }}>
      <label>Case ID <input required value={draft} onChange={event => setDraft(event.target.value)} /></label>
      <button>Open case</button>
    </form>
    {caseId && <><ClinicalObservations key={caseId} caseId={caseId} /><JourneyLog key={"log-" + caseId} caseId={caseId} /></>}
  </main>;
}


export function SpecialistBooking({ caseId }) {
 const { data, error } = useCaseResource(caseId ? `/cases/${caseId}/specialist` : null, 5000);
 return <section className="my-4 rounded-xl border p-4"><h2>Specialist check-up</h2>
  {error ? <p role="alert">{error}</p> : data?.slot ? <div><p>{data.slot.doctor.name}</p><p>{data.slot.doctor.medicalProfile?.qualification || "Qualification not recorded"} · {data.slot.specialty}</p><p>Reserved check-up · {new Date(data.slot.startsAt).toLocaleString()}</p></div>
   : <p role="status">{data?.message || "Checking specialist availability…"}</p>}
 </section>;
}


function SpecialistAvailability() {
 const [specialty,setSpecialty]=useState(""),[start,setStart]=useState(""),[end,setEnd]=useState(""),[message,setMessage]=useState("");
 const [busy,setBusy]=useState(false);
 return <form className="my-4 grid gap-2 rounded-xl border p-4" onSubmit={async event=>{
  event.preventDefault();setBusy(true);setMessage("");
  try {await api.post("/cases/specialist/slots",{specialty,startsAt:new Date(start).toISOString(),endsAt:new Date(end).toISOString()});setMessage("Availability published");}
  catch(error){setMessage(error.response?.data?.message||"Could not publish availability");}
  finally{setBusy(false);}
 }}>
 <h2>Publish specialist availability</h2>
 <label>Specialty <input required value={specialty} onChange={event=>setSpecialty(event.target.value)} placeholder="Cardiology / Cath Lab"/></label>
 <label>Starts <input required type="datetime-local" value={start} onChange={event=>setStart(event.target.value)}/></label>
 <label>Ends <input required type="datetime-local" value={end} onChange={event=>setEnd(event.target.value)}/></label>
 <button disabled={busy}>Publish slot</button><p role="status">{message}</p>
 </form>;
}


function HospitalSpecialistAvailability({hospitalId,specialty}) {
 const [opened,setOpened]=useState(false),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 return <details onToggle={event=>setOpened(event.currentTarget.open)}><summary>Publish qualified specialist availability</summary>
 {opened && <form className="grid gap-2 p-3" onSubmit={async event=>{
  event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget));
  setBusy(true);setMessage("");
  try{await api.post("/cases/hospital/specialists",{...values,hospitalId,startsAt:new Date(values.startsAt).toISOString(),endsAt:new Date(values.endsAt).toISOString()});setMessage("Doctor availability published. Matching will update automatically.");}
  catch(error){setMessage(error.response?.data?.message||"Could not publish availability");}
  finally{setBusy(false);}
 }}>
 <label>Doctor name <input name="name" required/></label>
 <label>Staff email <input name="email" type="email" required/></label>
 <label>Qualification <input name="qualification" required/></label>
 <label>Specialty <input name="specialty" defaultValue={specialty} required/></label>
 <label>Available from <input name="startsAt" type="datetime-local" required/></label>
 <label>Available until <input name="endsAt" type="datetime-local" required/></label>
 <button disabled={busy}>Publish availability</button><p role="status">{message}</p>
 </form>}</details>;
}
