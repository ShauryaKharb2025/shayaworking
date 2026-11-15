import {useState} from "react";
import {useCaseResource} from "../hooks/useCaseResource";
import api from "../api/axios";
export default function MaritimeAdvisories(){
 const connection=useCaseResource("/maritime/status",10000),resource=useCaseResource("/maritime/incidents",5000);
 const [pending,setPending]=useState(false),[error,setError]=useState(""),[history,setHistory]=useState(false),[older,setOlder]=useState([]),[cursor,setCursor]=useState(null);
 async function review(row,advisory,decision){
  setPending(true);setError("");
  try{await api.post(`/maritime/incidents/${row.id}/review`,{advisoryId:advisory.id,expectedVersion:row.trip.version,decision});await resource.load();}
  catch(e){setError(e.response?.data?.message||"Review failed. Refresh and retry.");await resource.load();}
  finally{setPending(false);}
 }
 async function more(){setPending(true);try{const {data}=await api.get("/maritime/incidents",{params:{cursor:cursor||resource.data.nextCursor}});setOlder(previous=>[...previous,...data.incidents]);setCursor(data.nextCursor||"end");}catch{setError("Could not load older incidents.");}finally{setPending(false);}}
 const rows=[...new Map([...(resource.data?.incidents||[]),...older].map(row=>[row.id,row])).values()];
 return <section className="sahay-card sahay-rescue" aria-label="Sahay RESCUE operations intelligence">
  <h2>Sahay RESCUE — Operations Intelligence</h2><p>Simulation intelligence · recommendations require human review. Agent assessments are not calibrated probabilities.</p>
  <p role="status">Agent connectivity · {connection.data?.status||"Checking…"}{connection.data?.source?" · "+connection.data.source:""}{connection.data?.missing?.length?" · Missing "+connection.data.missing.join(", "):""}{connection.data?.reason?" · "+connection.data.reason:""}</p>
  {connection.data?.status==="disabled"&&<p>Maritime is disabled. Primary Sahay emergency services continue independently.</p>}
  {(error||resource.error||connection.error)&&<p role="alert">{error||resource.error||connection.error}</p>}
  <label><input type="checkbox" checked={history} onChange={e=>setHistory(e.target.checked)}/> Include resolved incident history</label>
  {!resource.data&&!resource.error&&<p role="status">Loading incidents…</p>}
  {resource.data&&!rows.filter(row=>history||!["resolved","superseded"].includes(row.status)).length&&<p>No active RESCUE incidents.</p>}
  {rows.filter(row=>history||!["resolved","superseded"].includes(row.status)).map(row=><article key={row.id} className="sahay-rescue-incident">
   <h3>{row.category.replaceAll("_"," ")} · {row.caseAlias}</h3><p>{row.status.replaceAll("_"," ")} · Case {row.trip.status} · Detected {new Date(row.createdAt).toLocaleString()}</p>
   <details><summary>Inspect incident evidence and recommendations</summary>
    <ul>{row.evidence.map(e=><li key={e.id}><time>{new Date(e.at).toLocaleString()}</time> · {e.type} · Evidence {e.id}</li>)}</ul>
    {row.jobs.map(job=><div key={job.id}><p>{job.kind.replaceAll("_"," ")} · {job.status} · Attempts {job.attempts}{job.lastError?" · "+job.lastError:""}</p>
     {job.advisory&&<><p><strong>{job.advisory.response.severity}</strong> · {job.advisory.source}</p><p>{job.advisory.response.summary}</p><p>Hypothesis · {job.advisory.response.rootCauseHypothesis}</p><p>Uncertainty · {job.advisory.response.uncertainty}</p><p>Recommended recovery · {job.advisory.response.playbook}</p><p>Evidence · {job.advisory.response.evidenceRefs.join(", ")}</p><p>Admin review · {job.advisory.reviewStatus}</p>
      {job.advisory.reviewStatus==="pending"&&<><button className="sahay-button" disabled={pending||job.kind==="recovery"&&["resolved","superseded"].includes(row.status)} onClick={()=>review(row,job.advisory,"approve")}>{job.kind==="post_incident"?"Acknowledge final analysis":"Approve validated recovery"}</button><button className="sahay-button" disabled={pending} onClick={()=>review(row,job.advisory,"dismiss")}>Dismiss advisory</button>{job.kind==="recovery"&&["resolved","superseded"].includes(row.status)&&<p>The incident closed; its recovery recommendation is retained for audit only.</p>}</>}
      {job.advisory.execution&&<p>Reviewed action · {job.advisory.execution.code}{job.advisory.execution.engineReassessmentRequested?" · Engine reassessment requested; resource allocation is not guaranteed.":""}{job.advisory.execution.simulatedGpsRestored?" · Mock GPS restored.":""}</p>}
     </>}
    </div>)}
    <h4>Incident lifecycle</h4><ul>{row.audit.map(e=><li key={e.id}>{e.at} · {e.type}</li>)}</ul>
   </details>
  </article>)}
  {history&&cursor!=="end"&&(cursor||resource.data?.nextCursor)&&<button className="sahay-button" disabled={pending} onClick={more}>Load older incidents</button>}
 </section>;
}
