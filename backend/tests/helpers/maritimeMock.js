const http=require("node:http");
const {validateRequest}=require("../../src/integrations/maritime/contract");
const codes={AMBULANCE_OFFER_TIMEOUT:"ESCALATE_DRIVER_NONRESPONSE",AMBULANCE_REJECTION_CASCADE:"RETRY_ELIGIBLE_AMBULANCE",HOSPITAL_REFERRAL_FAILURE:"REASSESS_HOSPITAL_OPTIONS",ETA_DETERIORATION:"REQUEST_ROUTE_REEVALUATION",STALE_AMBULANCE_GPS:"FLAG_GPS_COMMUNICATION_FAILURE",HANDOFF_DELAY:"ESCALATE_ADMIN_REVIEW"};
function mockMaritime(){
 const state={mode:"valid",requests:[]};
 const server=http.createServer(async(req,res)=>{
  if(req.method==="GET"&&req.url==="/health"){res.end(JSON.stringify({source:"mock_maritime"}));return;}
  if(req.method!=="POST"||!/^\/api\/agents\/[^/]+\/chat$/.test(req.url)){res.writeHead(404);res.end();return;}
  if(req.headers.authorization!=="Bearer mock-maritime-key"){res.writeHead(401);res.end();return;}
  try{
   let raw="";for await(const chunk of req){raw+=chunk;if(raw.length>65536)throw new Error("too_large");}
   const request=validateRequest(JSON.parse(JSON.parse(raw).message));state.requests.push(request);
   if(state.mode==="slow")await new Promise(resolve=>setTimeout(resolve,250));
   if(state.mode==="429"){res.writeHead(429,{"Retry-After":"2"});res.end();return;}
   if(state.mode==="503"){res.writeHead(503);res.end();return;}
   if(state.mode==="invalid_json"){res.end("invalid JSON");return;}
   const answer={incidentId:request.incidentId,caseAlias:request.caseAlias,caseVersion:request.caseVersion,category:request.category,severity:"high",summary:"Synthetic watchdog recorded "+request.category,rootCauseHypothesis:"The underlying cause is not established by the supplied event timestamps.",playbook:request.kind==="post_incident"?"GENERATE_INCIDENT_SUMMARY":codes[request.category],evidenceRefs:[request.evidence.at(-1).id],uncertainty:"Local test fixture; no live AI reasoning or clinical assessment.",requiresAdminApproval:true,timestamp:new Date().toISOString()};
   if(state.mode==="missing_evidence")answer.evidenceRefs=[];
   res.setHeader("Content-Type","application/json");res.end(JSON.stringify({response:JSON.stringify(answer)}));
  }catch{res.writeHead(400);res.end(JSON.stringify({error:"invalid_mock_envelope"}));}
 });
 return {server,state};
}
module.exports={mockMaritime};
