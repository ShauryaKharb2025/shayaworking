import {useCaseResource} from "../hooks/useCaseResource";
export default function OperationalStatus({detailed=false}){
 const {data,error}=useCaseResource("/health",15000);
 if(error)return <div className="sahay-system-status" role="status">Service status unavailable. Check API connectivity.</div>;
 if(!data?.components)return null;
 const {gemini,osrm}=data.components;
 return <section className="sahay-system-status" aria-label="Operational service status">
  <p>{gemini.status==="healthy"?"Gemini assistance available":"Deterministic fallback active · Gemini "+gemini.status}.
   {osrm.status==="healthy"?" Road routing available.":" Road routing degraded · straight-line fallback is labelled on maps."}</p>
  {detailed&&<dl className="sahay-care-values">{Object.entries(data.components).map(([name,value])=><div key={name}><dt>{name}</dt><dd>{value.status}{value.reason?" · "+value.reason:""}</dd></div>)}</dl>}
 </section>;
}
