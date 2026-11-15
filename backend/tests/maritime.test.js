require("dotenv").config();
const {test,before,after,beforeEach,afterEach}=require("node:test");
const assert=require("node:assert/strict");
const {randomUUID}=require("node:crypto");
const {spawn}=require("node:child_process");
const db=require("../src/data/prisma");
const {config}=require("../src/integrations/maritime/config");
const {signals,envelope}=require("../src/integrations/maritime/events");
const {validate,validateRequest}=require("../src/integrations/maritime/contract");
const {retryAfter}=require("../src/integrations/maritime/client");
const worker=require("../src/integrations/maritime/worker");
const {mockMaritime}=require("./helpers/maritimeMock");
const {signAccessToken}=require("../src/utils/jwt");
const {createServer}=require("../../agents/sahay-rescue/server.cjs");
let mock,cfg,fixture,apiServer;
const event=(type,payload={},age=10000)=>({_id:randomUUID(),type,at:new Date(Date.now()-age).toISOString(),payload});
before(async()=>{
 mock=mockMaritime();await new Promise(r=>mock.server.listen(0,"127.0.0.1",r));
 cfg={...config(),enabled:true,apiKey:"mock-maritime-key",agentId:"local-rescue",base:"http://127.0.0.1:"+mock.server.address().port,gpsMs:1000,offerMs:1000,referralMs:1000,handoffMs:1000,rejectionWindowMs:300000,timeoutMs:1000,rpm:120};
 apiServer=spawn(process.execPath,["src/server.js"],{env:{...process.env,PORT:"5053",MARITIME_ENABLED:"false",RESCUE_GPS_STALE_MS:"1000",RESCUE_SIMULATION_CONTROLS:"true",ORCHESTRATION_ENABLED:"false"},stdio:"ignore"});
 for(let i=0;i<100;i++){try{if((await fetch("http://127.0.0.1:5053/api/health")).ok)return;}catch{}await new Promise(r=>setTimeout(r,50));}throw new Error("RESCUE test API failed to start");
});
beforeEach(async()=>{
 mock.state.mode="valid";mock.state.requests.length=0;
 await db.maritimeRuntime.deleteMany();
 const patient=await db.user.findUnique({where:{email:"patient@sahay.org"}});
 const driver=await db.user.create({data:{name:"Synthetic RESCUE driver",email:randomUUID()+"@test.invalid",role:"driver"}});
 const operator=await db.operator.create({data:{name:randomUUID(),type:"ngo",verified:true}});
 const vehicle=await db.ambulance.create({data:{vehicleNumber:randomUUID(),operatorId:operator.id,driverId:driver.id,status:"en_route",location:{coordinates:[77,28]},lastPingAt:new Date(Date.now()-10000)}});
 const trip=await db.trip.create({data:{patientId:patient.id,ambulanceId:vehicle.id,status:"en_route",pickupLocation:{coordinates:[77.1,28.1]},etaMinutes:1,events:[event("status:en_route")]}});
 fixture={patient,driver,operator,vehicle,trip,extraTrips:[]};
});
afterEach(async()=>{
 if(!fixture)return;
 await db.trip.deleteMany({where:{id:{in:[fixture.trip.id,...fixture.extraTrips]}}});
 await db.ambulance.delete({where:{id:fixture.vehicle.id}});await db.user.delete({where:{id:fixture.driver.id}});await db.operator.delete({where:{id:fixture.operator.id}});
 await db.maritimeRuntime.deleteMany();
});
after(async()=>{apiServer?.kill();mock.server.closeAllConnections();await new Promise(r=>mock.server.close(r));await db.$disconnect();});
const incident=async()=>{await worker.scan(cfg);return db.maritimeIncident.findFirst({where:{tripId:fixture.trip.id},include:{jobs:true}});};
const api=async(path,user,method="GET",body)=>{
 const r=await fetch("http://127.0.0.1:5053/api/maritime"+path,{method,headers:{"Content-Type":"application/json",Authorization:"Bearer "+signAccessToken({...user,_id:user.id})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};
};

test("all six deterministic incidents use elapsed facts and configurable thresholds",()=>{
 const base={...fixture.trip,ambulance:fixture.vehicle,referrals:[]};
 const cases=[
  ["AMBULANCE_OFFER_TIMEOUT",{status:"offered",autoDispatchAt:new Date(Date.now()-10000),events:[event("ambulance:offered")]}],
  ["AMBULANCE_REJECTION_CASCADE",{status:"requested",events:[event("ambulance:rejected"),event("ambulance:rejected"),event("ambulance:rejected")]}],
  ["HOSPITAL_REFERRAL_FAILURE",{status:"picked_up",referrals:[{id:randomUUID(),status:"rejected",createdAt:new Date()}]}],
  ["ETA_DETERIORATION",{etaMinutes:20,events:[event("status:en_route"),{...event("rescue:eta_baseline"),payload:{phase:fixture.trip.events[0]._id,etaMinutes:1}}]}],
  ["STALE_AMBULANCE_GPS",{}],
  ["HANDOFF_DELAY",{status:"arrived_hospital",events:[event("status:arrived_hospital")]}],
 ];
 for(const [category,overrides] of cases){
  if(category==="ETA_DETERIORATION")overrides.events[1].payload.phase=overrides.events[0]._id;
  const trip={...base,...overrides};assert.ok(signals(trip,cfg).some(s=>s.category===category),category);
  assert.equal(signals({...trip,status:"handed_off"},cfg).length,0);
 }
 assert.equal(signals(base,{...cfg,gpsMs:999999}).length,0);
});

test("watchdog deduplicates concurrent detection and records only synthetic evidence",async()=>{
 await Promise.all([worker.scan(cfg),worker.scan(cfg)]);
 assert.equal(await db.maritimeIncident.count({where:{tripId:fixture.trip.id}}),1);
 const row=await db.maritimeIncident.findFirst({where:{tripId:fixture.trip.id},include:{jobs:true}});
 assert.equal(row.jobs.length,1);assert.equal((await db.trip.findUnique({where:{id:fixture.trip.id}})).events.filter(e=>e.type==="rescue:detected").length,1);
 const trip=await db.trip.findUnique({where:{id:fixture.trip.id}}),request=envelope(row,row.jobs[0],trip);
 validateRequest(request);assert.ok(!JSON.stringify(request).includes(fixture.patient.email));
 assert.throws(()=>validateRequest({...request,facts:{patientName:"Private data"}}));
 const ids=new Set(trip.events.map(e=>e._id));assert.ok(request.evidence.every(e=>ids.has(e.id)));
});

test("multiple workers lease once; duplicate processing creates one immutable advisory",async()=>{
 const row=await incident();mock.state.mode="slow";
 const results=await Promise.all([worker.processOne(cfg),worker.processOne(cfg)]);
 assert.equal(results.filter(Boolean).length,1,JSON.stringify({results,jobs:await db.maritimeJob.findMany(),requests:mock.state.requests}));assert.equal(mock.state.requests.length,1);
 assert.equal(await db.maritimeAdvisory.count({where:{job:{incidentId:row.id}}}),1);
 assert.equal(await worker.processOne(cfg),false);
 const saved=await db.maritimeIncident.findUnique({where:{id:row.id}});assert.equal(saved.status,"admin_review_required");
 assert.ok(saved.audit.some(e=>e.type==="recommendation_ready"));
});

test("expired lease survives restart and the old token cannot own the recovered job",async()=>{
 const row=await incident(),old=await worker.claim(cfg);
 await db.maritimeJob.update({where:{id:old.job.id},data:{leaseUntil:new Date(Date.now()-1)}});
 await worker.processOne(cfg);
 const job=await db.maritimeJob.findUnique({where:{id:row.jobs[0].id}});
 assert.equal(job.status,"done");assert.equal(job.attempts,2);assert.equal(job.leaseToken,null);
 assert.equal(await db.maritimeAdvisory.count({where:{jobId:job.id}}),1);
});

test("stale in-flight recommendation is discarded after the case changes",async()=>{
 const row=await incident();mock.state.mode="slow";const processing=worker.processOne(cfg);
 for(let i=0;i<200&&!mock.state.requests.length;i++)await new Promise(r=>setTimeout(r,5));
 assert.ok(mock.state.requests.length,"Mock agent must receive the claimed job");
 await db.trip.update({where:{id:fixture.trip.id},data:{status:"picked_up",version:{increment:1}}});
 await processing;await worker.scan(cfg);
 assert.equal(await db.maritimeAdvisory.count({where:{job:{incidentId:row.id}}}),0);
 assert.equal((await db.maritimeIncident.findUnique({where:{id:row.id}})).status,"resolved");
 await worker.scan(cfg);assert.equal((await db.maritimeIncident.findUnique({where:{id:row.id}})).status,"resolved");
});

test("resolved incidents receive one post-handoff analysis without reopening",async()=>{
 const row=await incident();await worker.processOne(cfg);
 const current=await db.trip.findUnique({where:{id:fixture.trip.id}});
 await db.trip.update({where:{id:fixture.trip.id},data:{status:"handed_off",version:{increment:1},events:[...current.events,event("simulation:gps_restored",{},0),event("journey:rescue_reviewed",{},0),event("status:handed_off",{},0)]}});
 await worker.scan(cfg);await worker.processOne(cfg);await worker.scan(cfg);
 const jobs=await db.maritimeJob.findMany({where:{incidentId:row.id},include:{advisory:true}});
 assert.equal(jobs.length,2);assert.equal(jobs.find(j=>j.kind==="post_incident").advisory.response.playbook,"GENERATE_INCIDENT_SUMMARY");
 assert.ok(jobs.find(j=>j.kind==="post_incident").evidence.some(e=>e.type==="simulation:gps_restored"));
 assert.equal((await db.maritimeIncident.findUnique({where:{id:row.id}})).status,"resolved");
 const post=jobs.find(j=>j.kind==="post_incident"),admin=await db.user.findUnique({where:{email:"admin@sahay.org"}}),trip=await db.trip.findUnique({where:{id:fixture.trip.id}});
 assert.equal((await api(`/incidents/${row.id}/review`,admin,"POST",{advisoryId:post.advisory.id,expectedVersion:trip.version,decision:"approve"})).status,200);
 assert.equal((await db.trip.findUnique({where:{id:trip.id}})).status,"handed_off");
});

for(const mode of ["invalid_json","missing_evidence","429","slow"]){
 test("Maritime "+mode+" is retried durably with a bounded deadline",async()=>{
  const row=await incident();mock.state.mode=mode;const start=Date.now();
  await worker.processOne({...cfg,timeoutMs:100});
  const job=await db.maritimeJob.findUnique({where:{id:row.jobs[0].id}});
  assert.equal(job.status,"pending");assert.equal(job.attempts,1);assert.ok(job.nextAttemptAt>new Date());
  assert.equal(await db.maritimeAdvisory.count({where:{jobId:job.id}}),0);
  if(mode==="slow"){assert.ok(Date.now()-start<1000);assert.equal(job.lastError,"timeout");}
  if(mode==="429"){assert.ok(job.nextAttemptAt.getTime()-start>=1900);assert.equal(await worker.processOne(cfg),false);}
 });
}

test("request budget and circuit breaker persist across worker instances",async()=>{
 const row=await incident();mock.state.mode="503";
 for(let i=0;i<3;i++){await db.maritimeJob.update({where:{id:row.jobs[0].id},data:{nextAttemptAt:new Date(0)}});assert.equal(await worker.processOne(cfg),true);}
 const runtime=await db.maritimeRuntime.findUnique({where:{id:"default"}});assert.equal(runtime.failures,3);assert.ok(runtime.openUntil>new Date());
 assert.equal(await worker.processOne(cfg),false);assert.equal(mock.state.requests.length,3);
 await db.maritimeRuntime.update({where:{id:"default"},data:{openUntil:null}});
 await db.maritimeJob.update({where:{id:row.jobs[0].id},data:{nextAttemptAt:new Date(0)}});
 assert.equal(await worker.processOne({...cfg,rpm:1}),false);
 assert.equal(retryAfter("2"),2000);assert.ok(retryAfter(new Date(Date.now()+10000).toUTCString())>8000);
});

test("disabled and unconfigured Maritime make no network calls or dispatch changes",async()=>{
 await worker.scan({...cfg,enabled:false});assert.equal(await db.maritimeIncident.count({where:{tripId:fixture.trip.id}}),0);
 await incident();assert.equal(await worker.processOne({...cfg,enabled:false}),false);assert.equal(await worker.processOne({...cfg,apiKey:""}),false);
 assert.equal(mock.state.requests.length,0);assert.equal((await db.trip.findUnique({where:{id:fixture.trip.id}})).status,"en_route");
 assert.deepEqual((await worker.status({...cfg,apiKey:"",agentId:""})).missing,["MARITIME_API_KEY","MARITIME_AGENT_ID"]);
});

test("response contract rejects invented evidence, mutations, stale versions and unbounded confidence claims",async()=>{
 await incident();await worker.processOne(cfg);const request=mock.state.requests[0],saved=await db.maritimeAdvisory.findFirst({where:{job:{incident:{tripId:fixture.trip.id}}}});
 for(const change of [{playbook:"EXECUTE_SQL"},{evidenceRefs:[randomUUID()]},{caseVersion:request.caseVersion+1},{timestamp:"2000-01-01T00:00:00.000Z"},{requiresAdminApproval:false},{confidence:1}])assert.throws(()=>validate({...saved.response,...change},request));
});

test("Admin review is authorized, current-state checked and idempotent",async()=>{
 const row=await incident();await worker.processOne(cfg);
 const advisory=await db.maritimeAdvisory.findFirst({where:{job:{incidentId:row.id}}});
 const admin=await db.user.findUnique({where:{email:"admin@sahay.org"}});
 assert.equal((await api("/incidents",fixture.patient)).status,403);assert.equal((await api("/status",fixture.driver)).status,403);
 let trip=await db.trip.findUnique({where:{id:fixture.trip.id}});const body={advisoryId:advisory.id,expectedVersion:trip.version,decision:"approve"};
 assert.equal((await api(`/incidents/${row.id}/review`,fixture.patient,"POST",body)).status,403);
 await db.trip.update({where:{id:trip.id},data:{version:{increment:1}}});
 assert.equal((await api(`/incidents/${row.id}/review`,admin,"POST",body)).status,409);
 trip=await db.trip.findUnique({where:{id:trip.id}});body.expectedVersion=trip.version;
 const responses=await Promise.all([api(`/incidents/${row.id}/review`,admin,"POST",body),api(`/incidents/${row.id}/review`,admin,"POST",body)]);
 assert.ok(responses.every(r=>r.status===200),JSON.stringify(responses));
 assert.equal((await db.maritimeIncident.findUnique({where:{id:row.id}})).audit.filter(e=>e.type==="admin:approve").length,1);
 assert.equal((await db.trip.findUnique({where:{id:trip.id}})).ambulanceId,fixture.vehicle.id);
});

test("custom container follows health/chat contract and refuses unconfigured or invalid input",async()=>{
 const unavailable=createServer({});await new Promise(r=>unavailable.listen(0,"127.0.0.1",r));
 try{assert.equal((await fetch("http://127.0.0.1:"+unavailable.address().port+"/health")).status,503);}finally{unavailable.closeAllConnections();await new Promise(r=>unavailable.close(r));}
 await incident();await worker.processOne(cfg);const request=mock.state.requests[0],advisory=await db.maritimeAdvisory.findFirst({where:{job:{incident:{tripId:fixture.trip.id}}}});
 const agent=createServer({OPENAI_API_KEY:"local-model-key",OPENAI_BASE_URL:"http://127.0.0.1/model",RESCUE_MODEL:"fixture-model"},async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(advisory.response)}}]}),{status:200}));
 await new Promise(r=>agent.listen(0,"127.0.0.1",r));const base="http://127.0.0.1:"+agent.address().port;
 try{
  assert.equal((await fetch(base+"/health")).status,200);
  const response=await fetch(base+"/chat",{method:"POST",body:JSON.stringify({message:JSON.stringify(request),source:"front_door"})});assert.equal(response.status,200);validate(JSON.parse((await response.json()).response),request);
  assert.equal((await fetch(base+"/chat",{method:"POST",body:JSON.stringify({message:JSON.stringify({...request,patientName:"Private"})})})).status,400);
 }finally{agent.closeAllConnections();await new Promise(r=>agent.close(r));}
});

test("attempt exhaustion leaves an auditable failed incident instead of an orphaned investigation",async()=>{
 const row=await incident();const claimed=await worker.claim(cfg);
 await db.maritimeJob.update({where:{id:claimed.job.id},data:{leaseUntil:new Date(0),attempts:cfg.maxAttempts}});
 assert.equal(await worker.processOne(cfg),false);
 assert.equal((await db.maritimeJob.findUnique({where:{id:claimed.job.id}})).lastError,"attempt_limit");
 assert.equal((await db.maritimeIncident.findUnique({where:{id:row.id}})).status,"failed");
});

test("real-account cases are excluded even when the integration is enabled",async()=>{
 const other=await db.user.create({data:{email:randomUUID()+"@test.invalid",name:"Private fixture",role:"patient"}});
 try{
  await db.trip.update({where:{id:fixture.trip.id},data:{patientId:other.id}});await worker.scan(cfg);
  assert.equal(await db.maritimeIncident.count({where:{tripId:fixture.trip.id}}),0);assert.equal(mock.state.requests.length,0);
 }finally{await db.trip.update({where:{id:fixture.trip.id},data:{patientId:fixture.patient.id}});await db.user.delete({where:{id:other.id}});}
});

test("closing and dismissing an obsolete recommendation cannot reopen its incident",async()=>{
 const row=await incident();await worker.processOne(cfg);
 await db.trip.update({where:{id:fixture.trip.id},data:{status:"picked_up",version:{increment:1}}});await worker.scan(cfg);
 const advisory=await db.maritimeAdvisory.findFirst({where:{job:{incidentId:row.id}}}),trip=await db.trip.findUnique({where:{id:fixture.trip.id}});
 const admin=await db.user.findUnique({where:{email:"admin@sahay.org"}});
 const body={advisoryId:advisory.id,expectedVersion:trip.version,decision:"dismiss"};
 assert.equal((await api(`/incidents/${row.id}/review`,admin,"POST",body)).status,200);
 assert.equal((await db.maritimeIncident.findUnique({where:{id:row.id}})).status,"resolved");
});

test("all incident categories persist a distinct evidence-backed outbox episode",async()=>{
 const phase=event("status:en_route");
 const cases=[
  ["AMBULANCE_OFFER_TIMEOUT",{status:"offered",events:[event("ambulance:offered")],autoDispatchAt:new Date(0)}],
  ["AMBULANCE_REJECTION_CASCADE",{status:"requested",events:[event("ambulance:rejected"),event("ambulance:rejected"),event("ambulance:rejected")]}],
  ["HOSPITAL_REFERRAL_FAILURE",{status:"picked_up",events:[]}],
  ["ETA_DETERIORATION",{status:"en_route",etaMinutes:20,events:[phase,event("rescue:eta_baseline",{phase:phase._id,etaMinutes:1})]}],
  ["STALE_AMBULANCE_GPS",{status:"en_route",events:[event("status:en_route")]}],
  ["HANDOFF_DELAY",{status:"arrived_hospital",events:[event("status:arrived_hospital")]}],
 ];
 const hospital=await db.hospital.findFirst();
 for(const [category,changes] of cases){
  await db.hospitalReferral.deleteMany({where:{tripId:fixture.trip.id}});
  await db.trip.update({where:{id:fixture.trip.id},data:{...changes,ambulanceId:fixture.vehicle.id,version:{increment:1}}});
  if(category==="HOSPITAL_REFERRAL_FAILURE")await db.hospitalReferral.create({data:{tripId:fixture.trip.id,hospitalId:hospital.id,status:"rejected"}});
  await worker.scan(cfg);
  const saved=await db.maritimeIncident.findFirst({where:{tripId:fixture.trip.id,category},include:{jobs:true}});
  assert.ok(saved,category);assert.equal(saved.jobs.length,1);assert.ok(saved.evidence.length);
 }
 await db.hospitalReferral.deleteMany({where:{tripId:fixture.trip.id}});
});

test("a late reply from an expired worker cannot overwrite the new lease result",async()=>{
 await incident();mock.state.mode="slow";const old=worker.processOne(cfg);
 for(let i=0;i<200&&!mock.state.requests.length;i++)await new Promise(r=>setTimeout(r,5));
 assert.ok(mock.state.requests.length);
 const job=await db.maritimeJob.findFirst({where:{incident:{tripId:fixture.trip.id}}});
 await db.maritimeJob.update({where:{id:job.id},data:{leaseUntil:new Date(0)}});
 const replacement=worker.processOne(cfg);await Promise.all([old,replacement]);
 assert.equal(mock.state.requests.length,2);assert.equal(await db.maritimeAdvisory.count({where:{jobId:job.id}}),1);
 assert.equal((await db.maritimeJob.findUnique({where:{id:job.id}})).status,"done");
});
