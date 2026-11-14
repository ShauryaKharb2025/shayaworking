import { Link } from "react-router-dom";
import { Ambulance, Building2, ClipboardList, MapPin, ShieldCheck, Users } from "../components/Icons";
const steps=[
 [MapPin,"Share your pickup","Select a location on the map, add a landmark and describe the symptoms. Your ALS or BLS preference is saved for dispatcher review."],
 [ClipboardList,"Dispatcher reviews the request","The dispatcher checks the case and assigns an available ambulance and driver. The case stays pending until an assignment is recorded."],
 [Ambulance,"Follow the ambulance","View the latest reported position and transport stage. A missing or old GPS timestamp is shown as uncertain, and an ETA appears only when it is recorded."],
 [Building2,"Coordinate the destination","The selected hospital is shown separately from hospital acceptance. This prototype does not treat a selected destination as a confirmed bed."],
 [Users,"Share approved progress","Caregiver invitations and clinician milestones are shown as design previews until their secure backend workflows are implemented."],
 [ShieldCheck,"Record the handoff","The operational team records arrival and handoff. The journey timeline reflects stored case events rather than invented progress."]
];
export default function Home(){return <div className="js-workspace"><div className="js-role-header"><ShieldCheck/><div><h1>Help, coordinated every step</h1><p>From your first request to a recorded hospital handoff.</p></div></div><div className="js-how-grid">{steps.map(([Icon,title,body],i)=><section className="js-card" key={title}><span className="js-how-number">0{i+1}</span><Icon/><h2>{title}</h2><p>{body}</p></section>)}</div><div className="js-medical-note"><Ambulance/><div><strong>A simulation for coordinated emergency response</strong><p>JeevanSetu is a prototype. For emergency assistance, call 112.</p></div><Link className="js-button dark" to="/">Open Patient / SOS</Link></div></div>}
