const playbooks = ["RETRY_ELIGIBLE_AMBULANCE","ESCALATE_DRIVER_NONRESPONSE","REASSESS_HOSPITAL_OPTIONS","REQUEST_ROUTE_REEVALUATION","FLAG_GPS_COMMUNICATION_FAILURE","ESCALATE_ADMIN_REVIEW","GENERATE_INCIDENT_SUMMARY"];
const allowed = {
  AMBULANCE_OFFER_TIMEOUT:["RETRY_ELIGIBLE_AMBULANCE","ESCALATE_DRIVER_NONRESPONSE"], AMBULANCE_REJECTION_CASCADE:["RETRY_ELIGIBLE_AMBULANCE"],
  HOSPITAL_REFERRAL_FAILURE:["REASSESS_HOSPITAL_OPTIONS"], ETA_DETERIORATION:["REQUEST_ROUTE_REEVALUATION"],
  STALE_AMBULANCE_GPS:["FLAG_GPS_COMMUNICATION_FAILURE"], HANDOFF_DELAY:["ESCALATE_ADMIN_REVIEW"],
};
const keys = ["incidentId","caseAlias","caseVersion","category","severity","summary","rootCauseHypothesis","playbook","evidenceRefs","uncertainty","requiresAdminApproval","timestamp"];
const isEvidenceType=type=>typeof type==="string"&&/^(rescue:detected|status:(dispatched|en_route|picked_up|en_route_hospital|arrived_hospital|handed_off)|ambulance:(rejected|offer_expired)|hospital:(rejected|referral_expired|confirmed)|simulation:gps_(interrupted|restored)|journey:rescue_reviewed)$/.test(type);
function validate(value, request, now = Date.now()) {
  const bad = () => {throw Object.assign(new Error("Invalid RESCUE agent response"),{code:"invalid_response"});};
  if (!value || typeof value!=="object" || Array.isArray(value) || Object.keys(value).length!==keys.length || keys.some(key=>!Object.hasOwn(value,key))) bad();
  for (const key of ["incidentId","caseAlias","caseVersion","category"]) if (value[key]!==request[key]) bad();
  if (!["low","medium","high","critical"].includes(value.severity) || value.requiresAdminApproval!==true) bad();
  for (const key of ["summary","rootCauseHypothesis","uncertainty"]) if (typeof value[key]!=="string" || !value[key].trim() || value[key].length>1500) bad();
  const choices=request.kind==="post_incident" ? ["GENERATE_INCIDENT_SUMMARY"] : [...(allowed[request.category] || []),"ESCALATE_ADMIN_REVIEW","GENERATE_INCIDENT_SUMMARY"];
  if (!playbooks.includes(value.playbook) || !choices.includes(value.playbook)) bad();
  const evidence = new Set(request.evidence.map(row=>row.id));
  if (!Array.isArray(value.evidenceRefs) || value.evidenceRefs.length<1 || value.evidenceRefs.length>20 || value.evidenceRefs.some(id=>!evidence.has(id))) bad();
  const timestamp=Date.parse(value.timestamp);
  if (!Number.isFinite(timestamp) || Math.abs(now-timestamp)>300000) bad();
  return value;
}
function validateRequest(request){
  const bad=()=>{throw Object.assign(new Error("Invalid synthetic evidence envelope"),{code:"invalid_evidence"});};
  const uuid=value=>typeof value==="string"&&/^[a-f0-9-]{36}$/i.test(value);
  const timestamp=value=>typeof value==="string"&&/^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(value)&&Number.isFinite(Date.parse(value));
  const fields=["schemaVersion","kind","incidentId","caseAlias","caseVersion","category","state","detectedAt","facts","evidence"];
  if(!request||Object.keys(request).some(key=>!fields.includes(key))||fields.some(key=>!Object.hasOwn(request,key)))bad();
  if(request.schemaVersion!==1||!["recovery","post_incident"].includes(request.kind)||!uuid(request.incidentId)||!/^case_[a-f0-9]{12}$/.test(request.caseAlias)||!Number.isInteger(request.caseVersion)||request.caseVersion<0||!allowed[request.category]||!timestamp(request.detectedAt))bad();
  if(!["requested","offered","dispatched","en_route","arrived_pickup","picked_up","en_route_hospital","arrived_hospital","handed_off","cancelled","waitlisted"].includes(request.state))bad();
  const numbers=["rejectionCount","baselineMinutes","currentMinutes","thresholdMs"],dates=["deadline","expiredAt","createdAt","lastPingAt","arrivedAt"];
  const facts=value=>{if(!value||typeof value!=="object"||Array.isArray(value))bad();for(const [key,item] of Object.entries(value)){
    if(numbers.includes(key)){if(!Number.isFinite(item)||item<0)bad();}
    else if(dates.includes(key)){if(!timestamp(item))bad();}
    else if(key==="referralStatus"){if(!["proposed","withdrawn","rejected"].includes(item))bad();}
    else bad();
  }};
  facts(request.facts);
  if(!Array.isArray(request.evidence)||!request.evidence.length||request.evidence.length>20)bad();
  for(const row of request.evidence){
    const {id,type,at,category,...rest}=row;
    if(!uuid(id)||!timestamp(at)||!isEvidenceType(type)||category!==undefined&&category!==request.category)bad();facts(rest);
  }
  return request;
}
module.exports = { validate, validateRequest, playbooks, isEvidenceType };
