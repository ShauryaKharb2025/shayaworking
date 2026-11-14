import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import JourneyMap from "../components/JourneyMap";
import { Ambulance, Building2, ClipboardList, Headphones, ShieldCheck, Stethoscope, Users } from "../components/Icons";
const content={
 dispatcher:{icon:Headphones,title:"Dispatcher workspace",subtitle:"Coordinate the right vehicle and receiving hospital.",stats:[["Open incidents","03"],["Available vehicles","08"],["Hospital reviews","02"]],heading:"Incident queue",rows:[["SH-CARD-001","Cardiac · ALS required"],["SH-TRAUMA-002","Trauma · review needed"],["SH-RESP-003","Breathing · awaiting review"]],detail:"Fleet eligibility",items:[["ALS-03","Equipment and crew suitable · sample"],["BLS-01","Excluded · ALS equipment unavailable"],["ALS-07","Excluded · GPS timestamp stale"]]},
 driver:{icon:Ambulance,title:"Driver workspace",subtitle:"Your current offer, pickup details and transport progress.",stats:[["Vehicle","ALS-03"],["Offer status","Pending"],["Sample pickup","6 min"]],heading:"Current offer",rows:[["SH-CARD-001","Patel Nagar, Delhi"],["Required vehicle","ALS · cardiac equipment"],["Destination","Hospital acceptance pending"]],detail:"Before you start",items:[["Acknowledge offer","An offer is provisional until accepted"],["Equipment check","Confirm operational readiness"],["Transport","Wait for an accepted destination"]]},
 hospital:{icon:Building2,title:"Hospital readiness",subtitle:"Manage incoming referrals and receiving capacity.",stats:[["Sample referrals","02"],["Sample ER beds","04"],["Readiness","Review"]],heading:"Incoming referrals",rows:[["SH-CARD-001","Cardiac · ALS · acceptance pending"],["SH-TRAUMA-002","Trauma · team review required"],["Receiving status","Sample snapshot · not a live bed count"]],detail:"Receiving capabilities",items:[["Cardiac care","Sample team availability"],["Equipment","ECG · defibrillator · ventilator"],["Acceptance","Separate from a destination recommendation"]]},
 operator:{icon:ShieldCheck,title:"Fleet operations",subtitle:"Vehicle readiness, crew qualifications and equipment.",stats:[["Sample fleet","12"],["Available","08"],["Needs review","04"]],heading:"Fleet overview",rows:[["ALS-03","ALS · idle · sample"],["BLS-01","BLS · idle · sample"],["ALS-07","ALS · stale GPS · sample"]],detail:"Verification checklist",items:[["Equipment","Review inventory and readiness"],["Crew","Verify role and certification"],["Location","Check the latest GPS timestamp"]]},
 clinician:{icon:Stethoscope,title:"Clinical progress",subtitle:"Source-attributed milestones and family-safe updates.",stats:[["Sample case","SH-CARD-001"],["Care stage","Assessment"],["Visibility","Restricted"]],heading:"Case milestones",rows:[["Assessment started","Synthetic entry · EMT · 10:28 AM"],["Care in progress","Synthetic entry · clinician · 10:30 AM"],["Hospital handoff","Not yet recorded"]],detail:"Clinical entry",items:[["Author","Assigned clinician or EMT"],["Visibility","Clinical team / approved family summary"],["Corrections","Preserve the original author and time"]]},
 caregiver:{icon:Users,title:"Caregiver journey",subtitle:"Follow a case through an authorized, revocable invitation.",stats:[["Sample case","SH-CARD-001"],["Sample ETA","6 min"],["Destination","Pending"]],heading:"Journey summary",rows:[["Ambulance","ALS-03 · sample acknowledged vehicle"],["Crew","Paramedic + EMT · sample roles"],["Hospital","Acceptance pending"]],detail:"Access to your loved one's case",items:[["Invitation","A verified, case-bound invitation is required"],["Updates","Only approved family summaries"],["Privacy","Access can be revoked by the case owner"]]}
};
export default function RolePreview({role}) {
 const c=content[role],Icon=c.icon,{user}=useAuth(),[selected,setSelected]=useState(null);
 const unsupported=["clinician","caregiver"].includes(role);
 return <div className="sahay-workspace">
  <div className="sahay-role-header"><Icon/><div><h1>{c.title}</h1><p>{c.subtitle}</p></div><span className="sahay-mode">Design preview</span></div>
  <div className="sahay-preview-note">Synthetic sample data · controls do not affect operational records.<Link to="/login">Sign in for available role tools →</Link></div>
  {unsupported&&<div className="sahay-alert" role="status">{role==="caregiver"?"Secure caregiver invitations and the family-summary endpoint are not implemented in this API. This screen shows the intended layout only.":"Role-scoped clinical entry is not implemented in this API. Sample milestones below are illustrative."}</div>}
  <div className="sahay-role-stats">{c.stats.map(([label,value])=><section className="sahay-card sahay-role-stat" key={label}><span>{label}</span><strong>{value}</strong></section>)}</div>
  <div className="sahay-role-preview-grid">
   <section className="sahay-card"><h2><ClipboardList/>{c.heading}</h2><ul>{c.rows.map(([label,value])=><li key={label}><strong>{label}</strong><span>{value}</span></li>)}</ul>
    <div className="sahay-role-actions"><Link className="sahay-button dark" to="/login">{user?"Switch account":"Sign in to continue"}</Link><button className="sahay-button" onClick={()=>setSelected(selected?null:c.rows[0])}>{selected?"Close case details":"Inspect sample case"}</button></div>
    {selected&&<div className="sahay-medical-note" role="status"><ClipboardList/><div><strong>{selected[0]}</strong><p>Sample pickup: Patel Nagar, Delhi. ALS requirements await authorized review. Vehicle offers and hospital acceptance are separate decisions.</p></div></div>}
    <JourneyMap preview/>
   </section>
   <section className="sahay-card"><h2><Icon/>{c.detail}</h2><ul>{c.items.map(([label,value])=><li key={label}><strong>{label}</strong><span>{value}</span></li>)}</ul>
    {role==="clinician"?<div className="sahay-clinical-draft"><label>Milestone stage<select defaultValue="assessment"><option value="assessment">Assessment started</option><option>Care in progress</option><option>Handoff</option></select></label><label>Synthetic note<textarea placeholder="Preview entry only. No clinical data is saved." rows={4}/></label><p>Saving requires a role-scoped clinical endpoint.</p><button className="sahay-button" disabled>Save milestone · unavailable</button></div>:<p>{role==="caregiver"?"No patient information is exposed by entering a case ID. Secure access must be verified before any real journey is displayed.":"Sign in with the appropriate role to view records and use the connected operational tools."}</p>}
    <div className="sahay-role-actions"><Link to="/" className="sahay-button">Patient / SOS</Link>{role==="hospital"&&<Link to="/operator" className="sahay-button">Fleet operations</Link>}</div>
   </section>
  </div>
 </div>
}
