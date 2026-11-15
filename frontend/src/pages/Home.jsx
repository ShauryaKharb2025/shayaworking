import { Link } from "react-router-dom";
import { Ambulance, Building2, ClipboardList, MapPin, ShieldCheck, Users } from "../components/Icons";
const steps=[
 [MapPin,"Share your pickup","Select a location on the map, add a landmark and describe the symptoms. Your condition, equipment requirements and ALS or BLS preference guide automatic matching."],
 [ClipboardList,"Engine offers an ambulance","The engine offers the nearest available compatible ambulance. The ride is confirmed when its driver accepts; administrators handle exceptions."],
 [Ambulance,"Follow the ambulance","View the latest reported position and transport stage. A missing or old GPS timestamp is shown as uncertain, and an ETA appears only when it is recorded."],
 [Building2,"Coordinate the destination","The selected hospital is shown separately from hospital acceptance. This prototype does not treat a selected destination as a confirmed bed."],
 [Users,"Share approved progress","Patients, ambulance drivers and receiving hospitals share persisted journey milestones and clinical observations."],
 [ShieldCheck,"Record the handoff","The operational team records arrival and handoff. The journey timeline reflects stored case events rather than invented progress."]
];
export default function Home(){return <div className="sahay-workspace"><div className="sahay-role-header"><ShieldCheck/><div><h1>Help, coordinated every step</h1><p>From your first request to a recorded hospital handoff.</p></div></div><div className="sahay-how-grid">{steps.map(([Icon,title,body],i)=><section className="sahay-card" key={title}><span className="sahay-how-number">0{i+1}</span><Icon/><h2>{title}</h2><p>{body}</p></section>)}</div><div className="sahay-medical-note"><Ambulance/><div><strong>A simulation for coordinated emergency response</strong><p>Sahay is a prototype. For emergency assistance, call 112.</p></div><Link className="sahay-button dark" to="/">Open Patient / SOS</Link></div></div>}
