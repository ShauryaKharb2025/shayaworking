import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useCaseResource } from "../hooks/useCaseResource";
import api from "../api/axios";

const sections = {
 health: { title:"Health information to share", role:"patient", fields:[
  ["allergies","Allergies"],["medicines","Current medicines"],["conditions","Existing conditions"],
  ["emergencyContact","Emergency contact name"],["emergencyPhone","Emergency contact phone"],
 ]},
 preparation: { title:"Hospital preparation and arrival", role:"hospital", fields:[
  ["dropoff","Ambulance drop-off point"],
  ["treatmentRoom","Allotted treatment room"],
  ["doctorContact","Treating doctor contact"],
  ["doctorNotes","Treating doctor details / instructions"],
  ["expectedArrival","Expected hospital arrival"],
 ], checks:[["teamAssigned","Receiving team assigned"],["bedReserved","Bed reserved"],["equipmentReady","Equipment ready"],["arrivalAcknowledged","Hospital arrival acknowledged"]]},
 handover: { title:"Structured ambulance handover", role:"driver", fields:[
  ["pulse","Recorded pulse (beats/min)"],["bloodPressure","Recorded blood pressure"],["oxygenSaturation","Recorded oxygen saturation"],
  ["temperature","Recorded temperature (include unit)"],["observations","Crew observations"],["treatmentGiven","Treatment actually given, with dose and time where recorded"],
 ]},
};
const time=value=>value?new Date(value).toLocaleString():"Not recorded";

function CareSection({ section, saved={}, canEdit, caseId, hospitalId, status, reload }) {
 const spec=sections[section];
 const [draft,setDraft]=useState(null),[error,setError]=useState(""),[saving,setSaving]=useState(false);
 const change=(key,value)=>setDraft(current=>({...current,values:{...current.values,[key]:value}}));
 return <section className="sahay-care-section">
  <div className="sahay-care-heading"><h3>{spec.title}</h3>{canEdit && !draft && <button type="button" onClick={()=>{
   setError("");setDraft({revision:saved.revision||0,values:Object.fromEntries([...spec.fields,...(spec.checks||[])].map(([key])=>[key,key==="expectedArrival" && saved[key] ? new Date(new Date(saved[key]).getTime()-new Date(saved[key]).getTimezoneOffset()*60000).toISOString().slice(0,16) : saved[key]??(spec.checks?.some(([check])=>check===key)?false:"")]))});
  }}>Edit</button>}</div>
  {draft ? <form className="sahay-care-form" onSubmit={async event=>{
   event.preventDefault();setSaving(true);setError("");
   try{await api.patch("/cases/"+caseId+"/care-details",{section,hospitalId,...draft,values:{...draft.values,...(draft.values.expectedArrival?{expectedArrival:new Date(draft.values.expectedArrival).toISOString()}:{})}});await reload();setDraft(null);}
   catch(err){setError(err.response?.data?.message||"Could not save this section");}
   finally{setSaving(false);}
  }}>
   {spec.fields.map(([key,label])=><label key={key}>{label}{key==="urgency"?
    <select value={draft.values[key]} onChange={event=>change(key,event.target.value)}>
     <option value="">Unassessed</option><option value="critical">Critical</option><option value="urgent">Urgent</option><option value="standard">Standard</option>
    </select>:<input type={key==="expectedArrival"?"datetime-local":"text"} maxLength={1500} value={draft.values[key]} onChange={event=>change(key,event.target.value)}
      placeholder={key==="expectedArrival"?"YYYY-MM-DDTHH:mm:ss+05:30":""}/>}</label>)}
   {spec.checks?.map(([key,label])=><label className="sahay-care-check" key={key}><input type="checkbox" checked={draft.values[key]} disabled={key==="arrivalAcknowledged" && status!=="arrived_hospital"} onChange={event=>change(key,event.target.checked)}/>{label}</label>)}
   {error&&<p role="alert">{error}</p>}
   <div className="sahay-care-actions"><button disabled={saving}>Save section</button><button type="button" disabled={saving} onClick={()=>setDraft(null)}>Cancel / reload latest</button></div>
  </form>:<>
   <dl className="sahay-care-values">{spec.fields.map(([key,label])=><div key={key}><dt>{label}</dt><dd>{saved[key] ? key==="expectedArrival" ? time(saved[key]) : saved[key] : "Not recorded"}</dd></div>)}</dl>
   {spec.checks && <ul className="sahay-care-checklist">{spec.checks.map(([key,label])=><li key={key}><label className="sahay-care-check">
    <input type="checkbox" checked={!!saved[key]} disabled={!canEdit || saving || (key==="arrivalAcknowledged" && status!=="arrived_hospital")} onChange={async event=>{
      const checked=event.target.checked;setSaving(true);setError("");
      try{await api.patch("/cases/"+caseId+"/care-details",{section,hospitalId,revision:saved.revision||0,values:{[key]:checked}});await reload();}
      catch(err){setError(err.response?.data?.message||"Could not update checkpoint");}
      finally{setSaving(false);}
    }}/>{label} · {saved[key]?"Confirmed":"Pending"}
   </label></li>)}</ul>}
   {error && <p role="alert">{error}</p>}
   {section==="handover"&&<p className="sahay-field-help">{saved.source==="simulated"?"Simulated demo readings":saved.source==="crew"?"Crew-entered readings":"Awaiting readings"} · Last measured {time(saved.updatedAt)}</p>}
   {section!=="handover"&&saved.updatedAt&&<p className="sahay-field-help">Last recorded {time(saved.updatedAt)}</p>}
  </>}
 </section>;
}

export default function CaseCarePanel({caseId}) {
 const {user}=useAuth();
 const resource=useCaseResource(caseId?"/cases/"+caseId+"/care-details":null,5000);
 const data=resource.data;
 const steps={
  requested:["Matching engine","Finding ambulance and receiving hospital"],
  offered:["Assigned driver","Review and accept the pickup"],
  dispatched:["Ambulance driver","Start journey to pickup"],
  en_route:["Ambulance driver","Travelling to pickup"],
  arrived_pickup:["Ambulance crew","Confirm patient pickup"],
  picked_up:["Ambulance driver","Start route once hospital acceptance is confirmed"],
  en_route_hospital:["Hospital receiving team","Prepare for patient arrival"],
  arrived_hospital:["Hospital receiving team","Acknowledge arrival and complete handover"],
  handed_off:["Hospital treating team","Continue documented care"],
  cancelled:["Request closed","Cancelled"],
 };
 if(resource.error)return <p role="alert">{resource.error}</p>;
 if(!data)return <p role="status">Loading care coordination…</p>;
 const [owner,next]=steps[data.status]||["Care team","Review case status"];
 const stale=!data.gpsLastSeen||Date.now()-new Date(data.gpsLastSeen).getTime()>90000;
 return <section className="sahay-card sahay-care-panel" aria-label="Shared care coordination">
  <h2>Care coordination</h2>
  <div className="sahay-care-next"><strong>{next}</strong><span>Responsible · {owner}</span></div>
  <p>Receiving hospital acknowledgement · {data.acknowledgement || "Pending"}</p>
  <p>ETA · {data.etaMinutes!=null?data.etaMinutes+" min to "+data.etaDestination:"Unavailable"} · Updated {time(data.etaUpdatedAt)}</p>
  <p>GPS · {stale?"Stale or unavailable":"Current"} · Last seen {time(data.gpsLastSeen)}</p>
  {data.delayed&&<p role="status" className="sahay-care-delay">Expected hospital arrival has passed. Receiving team should review the latest ETA.</p>}
  {data.hospital&&<p>Destination · {data.hospital.name} · {data.hospital.address || "Address not recorded"} · {data.hospital.contact || "Contact not recorded"}</p>}
  <section className="sahay-care-section"><h3>Responsible treating doctor</h3>
    {data.assignedDoctor ? <><p>{data.assignedDoctor.name} · {data.assignedDoctor.qualification || "Qualification not recorded"}</p>
      <p>{data.assignedDoctor.specialty} · Reserved slot {time(data.assignedDoctor.startsAt)}</p>
      <p>{data.assignedDoctor.phone || data.details?.preparation?.doctorContact || "Contact not recorded"}</p></> :
      <p>Matching an available qualified specialist at the selected hospital.</p>}
  </section>
  {Object.keys(sections).map(section=><CareSection key={section} section={section} saved={data.details?.[section]} canEdit={user?.role===sections[section].role && !["handed_off","cancelled"].includes(data.status)} caseId={caseId} status={data.status} hospitalId={data.hospital?.id} reload={resource.load}/>)}
  <section className="sahay-care-section"><h3>Patient on-way health logs</h3>
   <p>Timestamped readings shared by the ambulance. Demo readings are explicitly labelled.</p>
   {!data.healthReadings?.length&&<p>No health readings recorded yet.</p>}
   <div className="sahay-reading-scroll"><table className="sahay-reading-table"><thead><tr><th>Measured</th><th>Source</th><th>Pulse</th><th>BP</th><th>SpO₂</th><th>Temperature</th><th>Observations / treatment</th></tr></thead>
    <tbody>{data.healthReadings?.map(row=><tr key={row.id}><td>{time(row.measuredAt)}</td><td>{row.source==="simulated"?"Simulated demo":"Crew entered"}</td>
      <td>{row.values.pulse||"Not recorded"}</td><td>{row.values.bloodPressure||"Not recorded"}</td><td>{row.values.oxygenSaturation||"Not recorded"}</td><td>{row.values.temperature||"Not recorded"}</td>
      <td>{row.values.observations||"No observations recorded"} · {row.values.treatmentGiven||"No treatment recorded"}</td></tr>)}</tbody>
   </table></div>
  </section>
  {user?.role==="hospital"&&<section className="sahay-care-section"><h3>Changes since hospital acceptance</h3>
   {!data.changes?.length && <p>No subsequent activity recorded.</p>}
   <ul>{data.changes?.map(event=><li key={event._id}>{time(event.at)} · {event.type.replace(/[:_]/g," ")}</li>)}</ul>
   <h3>Latest crew and clinical observations</h3>
   {!data.observations?.length&&<p>No observations recorded.</p>}
   <ul>{data.observations?.map(row=><li key={row.id}>{time(row.createdAt)} · {row.type.replaceAll("_"," ")} · {row.note}</li>)}</ul>
  </section>}
 </section>;
}
