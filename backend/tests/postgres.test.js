require("dotenv").config();
const { test, after, before } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const prisma = require("../src/data/prisma");
const User = require("../src/models/User");
const Trip = require("../src/models/Trip");
const Ambulance = require("../src/models/Ambulance");
const { transaction } = require("../src/data/repository");
const { signAccessToken } = require("../src/utils/jwt");
const tag = randomUUID();
let server, patient, driver, dispatcher, admin, operator, vehicle;
const ids = { users: [], trips: [], ambulances: [], operators: [], waits: [] };
const base = "http://127.0.0.1:5051/api";
async function api(path, user, method = "GET", body) {
 const response = await fetch(base + path, { method, headers: { "Content-Type":"application/json", ...(path==="/sos"&&method==="POST"?{"Idempotency-Key":randomUUID()}:{}), ...(user ? {Authorization:"Bearer "+signAccessToken(user)} : {}) }, ...(body ? {body: JSON.stringify(body)} : {}) });
 return { status: response.status, data: await response.json() };
}
before(async () => {
 for (const role of ["patient", "driver", "dispatcher", "admin"]) {
  const user = await User.create({ name: "परीक्षण " + role, email: role + tag + "@test.invalid", role });
  ids.users.push(user._id);
  if (role === "patient") patient = user;
  if (role === "driver") driver = user;
  if (role === "dispatcher") dispatcher = user;
  if (role === "admin") admin = user;
 }
 operator = await prisma.operator.create({data:{name:tag,type:"ngo",verified:true}}); ids.operators.push(operator.id);
 vehicle = await Ambulance.create({ vehicleNumber:tag, operator:operator.id, tier:"ALS",status:"idle",complianceVerified:true,crew:[{role:"EMT",certified:true}] }); ids.ambulances.push(vehicle._id);
 server = spawn(process.execPath, ["src/server.js"], {env:{...process.env,PORT:"5051",GEMINI_API_KEY:"",ORCHESTRATION_ENABLED:"false"}, stdio:"pipe"});
 let logs = ""; server.stdout.on("data", c=>logs+=c); server.stderr.on("data",c=>logs+=c);
 for(let i=0;i<120;i++) {
  if (server.exitCode !== null) throw new Error(logs);
  try { if ((await fetch(base+"/health")).ok) return; } catch {}
  await new Promise(r=>setTimeout(r,100));
 }
 throw new Error("API startup timed out: "+logs);
});
after(async () => {
 server?.kill();
 await prisma.hospitalReferral.deleteMany({where:{trip:{patientId:{in:ids.users}}}});
 await prisma.trip.deleteMany({where:{patientId:{in:ids.users}}});
 await prisma.ambulance.deleteMany({where:{id:{in:ids.ambulances}}});
 await prisma.user.deleteMany({where:{id:{in:ids.users}}});
 await prisma.operator.deleteMany({where:{id:{in:ids.operators}}});
 await prisma.waitlistEntry.deleteMany({where:{contact:tag}});
 await prisma.$disconnect();
});
test("PostgreSQL stores Unicode, enforces foreign keys and hides password hashes", async()=>{
 const loaded = await User.findById(patient._id);
 assert.equal(loaded.name,"परीक्षण patient");
 assert.equal(loaded.passwordHash,undefined);
 await assert.rejects(prisma.trip.create({data:{patientId:"missing",pickupLocation:{coordinates:[0,0]}}}));
});
test("SOS, dispatch, nested relations, GPS and lifecycle remain API compatible", async()=>{
 const result = await api("/sos",patient,"POST",{lng:77.10,lat:28.75,address:"Delhi test",symptoms:["Synthetic symptom"],requestedAmbulanceTier:"ALS"});
 assert.equal(result.status,201,JSON.stringify(result.data));
 const trip = result.data.trip;
 assert.equal(trip.status,"requested");
 assert.ok(trip._id);
 assert.deepEqual(trip.symptoms,["Synthetic symptom"]);
 assert.equal(trip.requestedAmbulanceTier,"ALS");
 assert.equal((await api("/sos/"+trip._id,driver)).status,403);
 const assignment = await api("/dispatch/trip/"+trip._id+"/assign",dispatcher,"PATCH",{ambulanceId:vehicle._id,driverId:driver._id});
 assert.equal(assignment.status,200,JSON.stringify(assignment.data));
 assert.equal(assignment.data.trip.status,"offered");
 const patientView = await api("/sos/"+trip._id,patient);
 assert.equal(patientView.data.trip.ambulance._id,vehicle._id);
 assert.equal((await api("/dispatch/trip/"+trip._id+"/status",patient,"PATCH",{status:"dispatched"})).status,403);
 assert.equal((await api("/dispatch/trip/"+trip._id+"/status",driver,"PATCH",{status:"dispatched"})).status,200);
 assert.equal((await api("/sos/"+trip._id,driver)).status,200);
 const allocated = (await api("/sos/"+trip._id,patient)).data.trip.ambulance;
 assert.equal(allocated._id,vehicle._id);
 assert.equal(allocated.driver.name,driver.name);
 assert.equal(allocated.driver.passwordHash,undefined);
 const active = await api("/dispatch/driver-trip",driver);
 assert.equal(active.data.trip.patient.name,patient.name);
 assert.equal(active.data.trip.ambulance.driver.name,driver.name);
 const fleet = await api("/dispatch/fleet",dispatcher);
 assert.ok(fleet.data.ambulances.some(a=>a._id===vehicle._id && a.operator.name===tag));
 const gps = await api("/dispatch/ambulance/"+vehicle._id+"/location",driver,"POST",{lng:77.11,lat:28.76});
 assert.equal(gps.status,200,JSON.stringify(gps.data));
 const myTrips = await api("/sos",patient);
 assert.ok(myTrips.data.trips.some(t=>t._id===trip._id));
 const cancelled = await api("/dispatch/trip/"+trip._id+"/status",patient,"PATCH",{status:"cancelled"});
 assert.equal(cancelled.status,200,JSON.stringify(cancelled.data));
 assert.equal((await Ambulance.findById(vehicle._id)).status,"idle");
 assert.equal((await api("/dispatch/fleet",null)).status,401);
});
test("referral replacement and shared clinical handoff persist", async () => {
 const hospitalIds = [];
 try {
  for (let i = 0; i < 2; i++) {
   const h = await prisma.hospital.create({data:{name:tag + i, receivingReady:true, bedsAvailable:1}});
   hospitalIds.push(h.id);
  }
  const accounts = {};
  for (const [role, hospital] of [["hospital",hospitalIds[0]],["hospital",hospitalIds[1]],["clinician",hospitalIds[1]],["caregiver",null]]) {
   const account = await User.create({ name: role, email: randomUUID()+"@test.invalid", role, hospital });
   ids.users.push(account._id);
   accounts[role + (hospital || "")] = account;
  }
  const first = accounts["hospital"+hospitalIds[0]], second = accounts["hospital"+hospitalIds[1]];
  const clinician = accounts["clinician"+hospitalIds[1]], caregiver = accounts.caregiver;
  const created = await api("/sos",patient,"POST",{lng:77.10,lat:28.75,requestedAmbulanceTier:"ALS"});
  assert.equal(created.status,201);
  const id = created.data.trip._id, path = "/cases/"+id, dispatch = "/dispatch/trip/"+id;
  ids.trips.push(id);
  assert.equal((await api(dispatch+"/assign",dispatcher,"PATCH",{ambulanceId:vehicle._id,driverId:driver._id})).status,200);
  async function refer(hospitalId, account) {
   assert.equal((await api(path+"/referrals",dispatcher,"POST",{hospitalId})).status,201);
   const result = await api("/cases/hospital/referrals",account);
   const referral = result.data.referrals.find(row=>row.tripId===id);
   const endpoint = path+"/referrals/"+referral.id;
   assert.equal((await api(endpoint,account===first ? second : first,"PATCH",{action:"accepted"})).status,403);
   assert.equal((await api(endpoint,account,"PATCH",{action:"accepted"})).status,200);
   if (account === second) assert.equal((await api(endpoint,dispatcher,"PATCH",{action:"confirmed"})).status,200);
  }
  await refer(hospitalIds[0],first);
  const capacityCase = await api("/sos",patient,"POST",{lng:77.10,lat:28.75});
  ids.trips.push(capacityCase.data.trip._id);
  assert.equal((await api("/cases/"+capacityCase.data.trip._id+"/referrals",dispatcher,"POST",{hospitalId:hospitalIds[0]})).status,409);
  for (const status of ["dispatched","en_route","arrived_pickup","picked_up","en_route_hospital"]) {
   assert.equal((await api(dispatch+"/status",driver,"PATCH",{status})).status,200,status);
  }
  assert.equal((await api("/hospitals/"+hospitalIds[0]+"/beds",second,"PATCH",{bedsAvailable:0})).status,403);
  assert.equal((await api("/hospitals/"+hospitalIds[0]+"/beds",first,"PATCH",{bedsAvailable:0,receivingReady:false})).status,200);
  await refer(hospitalIds[1],second);
  const observation = {type:"vitals",note:"Synthetic measurement observed",familyVisible:true};
  assert.equal((await api(path+"/observations",patient,"POST",observation)).status,403);
  assert.equal((await api(path+"/observations",clinician,"POST",observation)).status,201);
  const plan={type:"operation_plan",note:"Synthetic planned procedure awaiting treating-team assessment",familyVisible:false};
  assert.equal((await api(path+"/observations",first,"POST",plan)).status,403);
  assert.equal((await api(path+"/observations",second,"POST",plan)).status,201);
  const journey=await api(path+"/journey",patient);
  assert.ok(journey.data.observations.some(row=>row.type==="operation_plan" && row.note===plan.note));
  const carePath=path+"/care-details";
  assert.equal((await api(carePath,patient,"PATCH",{section:"health",revision:0,values:{allergies:"Synthetic allergy",medicines:"Synthetic medicine",emergencyPhone:"000000"}})).status,200);
  assert.equal((await api(carePath,patient,"PATCH",{section:"health",revision:0,values:{allergies:"stale"}})).status,409);
  assert.equal((await api(carePath,second,"PATCH",{section:"health",revision:1,values:{allergies:"forbidden"}})).status,403);
  assert.equal((await api(carePath,first)).status,403);
  assert.equal((await api(carePath,second,"PATCH",{section:"preparation",hospitalId:hospitalIds[1],revision:0,values:{teamAssigned:true,bedReserved:true,receivingNurse:"Synthetic nurse",urgency:"urgent"}})).status,200);
  assert.equal((await api(carePath,second,"PATCH",{section:"preparation",hospitalId:hospitalIds[1],revision:1,values:{arrivalAcknowledged:true}})).status,409);
  assert.equal((await api(carePath,driver,"PATCH",{section:"handover",revision:0,values:{pulse:"Synthetic reading",observations:"Synthetic handover observation"}})).status,200);
  const shared=(await api(carePath,patient)).data;
  assert.equal(shared.details.health.allergies,"Synthetic allergy");
  assert.equal(shared.details.preparation.receivingNurse,"Synthetic nurse");
  assert.equal(shared.details.handover.observations,"Synthetic handover observation");
  assert.equal(shared.healthReadings.length,1);
  assert.equal(shared.healthReadings[0].source,"crew");
  assert.equal(shared.healthReadings[0].values.pulse,"Synthetic reading");
  assert.ok(shared.healthReadings[0].measuredAt);

  const availability={hospitalId:hospitalIds[1],name:clinician.name,email:clinician.email,qualification:"Synthetic specialist",specialty:"Test specialty",startsAt:new Date(Date.now()+3600000).toISOString(),endsAt:new Date(Date.now()+7200000).toISOString()};
  assert.equal((await api("/cases/hospital/specialists",first,"POST",availability)).status,403);
  assert.equal((await api("/cases/hospital/specialists",second,"POST",availability)).status,201);
  assert.equal((await api("/cases/hospital/specialists",second,"POST",availability)).status,409);

  for (const module of ["ambulance","hospital","coordination","journey"]) {
   const explanation = await api("/intelligence/trips/"+id+"/"+module,admin,"POST");
   assert.equal(explanation.status,200);
   assert.equal(explanation.data.source,"deterministic");
   if (module === "journey") assert.ok(explanation.data.input.events.some(event=>event.type==="vitals"));
  }
  assert.equal((await api(dispatch+"/status",driver,"PATCH",{status:"arrived_hospital"})).status,200);
  assert.equal((await api(dispatch+"/status",first,"PATCH",{status:"handed_off"})).status,403);
  assert.equal((await api(dispatch+"/status",second,"PATCH",{status:"handed_off"})).status,200);
  assert.equal((await api("/sos/"+id,patient)).data.trip.status,"handed_off");
 } finally {
  await prisma.hospitalReferral.deleteMany({where:{OR:[{tripId:{in:ids.trips}},{hospitalId:{in:hospitalIds}}]}});
  for (const model of [prisma.clinicalObservation,prisma.caregiverAccess]) {
   await model.deleteMany({where:{tripId:{in:ids.trips}}});
  }
  await prisma.doctorSlot.deleteMany({where:{doctor:{hospitalId:{in:hospitalIds}}}});
  await prisma.trip.deleteMany({where:{id:{in:ids.trips}}});
  await prisma.user.updateMany({where:{hospitalId:{in:hospitalIds}},data:{hospitalId:null}});
  await prisma.hospital.deleteMany({where:{id:{in:hospitalIds}}});
 }
});
test("demo Hospital ER completes a confirmed receiving handoff at another selected hospital",async()=>{
 let demoPatient=await User.findOne({email:"patient@sahay.org"});
 let demoER=await User.findOne({email:"hospital@sahay.org"});
 const newPatient=!demoPatient,newER=!demoER;
 const destination=await prisma.hospital.create({data:{name:tag+" handoff destination",location:{coordinates:[77,28]}}});
 let trip;
 try{
  if(!demoPatient)demoPatient=await User.create({email:"patient@sahay.org",name:"Demo patient",role:"patient"});
  if(!demoER)demoER=await User.create({email:"hospital@sahay.org",name:"Demo ER",role:"hospital"});
  trip=await prisma.trip.create({data:{patientId:demoPatient._id,hospitalId:destination.id,ambulanceId:vehicle._id,status:"arrived_hospital",pickupLocation:{coordinates:[77,28]}}});
  await prisma.ambulance.update({where:{id:vehicle._id},data:{status:"en_route"}});
  const endpoint="/dispatch/trip/"+trip.id+"/status";
  assert.equal((await api(endpoint,demoER,"PATCH",{status:"handed_off"})).status,403,"Unconfirmed destination must not grant demo handoff access");
  await prisma.hospitalReferral.create({data:{tripId:trip.id,hospitalId:destination.id,status:"confirmed"}});
  assert.equal((await api(endpoint,demoPatient,"PATCH",{status:"handed_off"})).status,403);
  const completed=await api(endpoint,demoER,"PATCH",{status:"handed_off"});
  assert.equal(completed.status,200,JSON.stringify(completed.data));
  assert.equal(completed.data.trip.status,"handed_off");
  assert.ok(completed.data.trip.handedOffAt);
  const patientView=await api("/sos/"+trip.id,demoPatient);
  assert.equal(patientView.data.trip.status,"handed_off");
  assert.ok(patientView.data.trip.events.some(row=>row.type==="status:handed_off"));
  assert.equal((await prisma.ambulance.findUnique({where:{id:vehicle._id}})).status,"idle");
 }finally{
  if(trip){
   await prisma.hospitalReferral.deleteMany({where:{tripId:trip.id}});
   await prisma.trip.delete({where:{id:trip.id}});
  }
  await prisma.hospital.delete({where:{id:destination.id}});
  if(newPatient && demoPatient)await prisma.user.delete({where:{id:demoPatient._id}});
  if(newER && demoER)await prisma.user.delete({where:{id:demoER._id}});
 }
});

test("SOS retries are idempotent and reject a reused key with different data",async()=>{
 const key=randomUUID(),body={lng:77.10,lat:28.75,symptoms:["Idempotency regression"]};
 const call=payload=>fetch(base+"/sos",{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":key,Authorization:"Bearer "+signAccessToken(patient)},body:JSON.stringify(payload)});
 const responses=await Promise.all([call(body),call(body)]);
 assert.deepEqual(responses.map(row=>row.status).sort(),[200,201]);
 const results=await Promise.all(responses.map(row=>row.json()));
 assert.equal(results[0].trip._id,results[1].trip._id);
 ids.trips.push(results[0].trip._id);
 assert.equal(await prisma.trip.count({where:{patientId:patient._id,requestKey:key}}),1);
 assert.equal((await call({...body,lat:28.76})).status,409);
});

test("admin replacement offers preserve isolation and stop after patient pickup",async()=>{
 const replacementDriver=await User.create({name:tag+" replacement",email:tag+"-replacement@test.invalid",role:"driver"});
 ids.users.push(replacementDriver._id);
 const replacement=await Ambulance.create({vehicleNumber:tag+"-replacement",operator:operator.id,driver:replacementDriver._id,tier:"ALS",status:"idle",complianceVerified:true,crew:[{role:"EMT",certified:true}],equipment:[],location:{coordinates:[77.1,28.75]}});
 ids.ambulances.push(replacement._id);
 const trip=await Trip.create({patient:patient._id,ambulance:vehicle._id,status:"offered",pickupLocation:{coordinates:[77.1,28.75]},requestedAmbulanceTier:"ALS"});
 ids.trips.push(trip._id);
 await prisma.ambulance.update({where:{id:vehicle._id},data:{status:"dispatched"}});
 const path="/cases/"+trip._id+"/replacement",body={ambulanceId:replacement._id,reason:"Regression replacement"};
 assert.equal((await api(path,patient,"POST",body)).status,403);
 const approval=await api(path,admin,"POST",body);
 assert.equal(approval.status,200,JSON.stringify(approval.data));
 const updated=await prisma.trip.findUnique({where:{id:trip._id}});
 assert.equal(updated.ambulanceId,replacement._id);
 assert.equal(updated.status,"offered");
 assert.equal((await prisma.ambulance.findUnique({where:{id:vehicle._id}})).status,"idle");
 for(const status of ["dispatched","en_route","arrived_pickup","picked_up"])assert.equal((await api("/dispatch/trip/"+trip._id+"/status",replacementDriver,"PATCH",{status})).status,200);
 assert.equal((await api(path,admin,"POST",{ambulanceId:vehicle._id,reason:"Too late"})).status,409);
 assert.equal((await api("/dispatch/trip/"+trip._id+"/status",patient,"PATCH",{status:"cancelled"})).status,200);
});

test("removed dashboard APIs are unavailable and health identifies Gemini fallback",async()=>{
 for(const path of ["/cases/clinician/queue","/cases/caregiver/cases","/cases/example/caregiver"]){
  assert.equal((await api(path,patient)).status,404,path);
 }
 const response=await api("/health");
 assert.equal(response.status,200);
 assert.equal(response.data.components.postgres.status,"healthy");
 assert.equal(response.data.components.gemini.status,"unavailable");
});

test("stale updates conflict; transactions roll back vehicle reservation",async()=>{
 const a = await Ambulance.findById(vehicle._id), b = await Ambulance.findById(vehicle._id);
 a.heading=10; await a.save();
 b.heading=20; await assert.rejects(b.save(),/Record changed/);
 await assert.rejects(transaction(async()=>{
  const fresh = await Ambulance.findById(vehicle._id);
  fresh.status="dispatched"; await fresh.save();
  throw new Error("rollback");
 }),/rollback/);
 assert.equal((await Ambulance.findById(vehicle._id)).status,"idle");
});
test("competing reservations have one winner and active trips cannot share a vehicle",async()=>{
 const results=await Promise.all([1,2].map(()=>Ambulance.findOneAndUpdate({_id:vehicle._id,status:"idle"},{$set:{status:"dispatched"}},{new:true})));
 assert.equal(results.filter(Boolean).length,1);
 const trip=await Trip.create({patient:patient._id,ambulance:vehicle._id,pickupLocation:{coordinates:[77,28]}});
 await assert.rejects(Trip.create({patient:patient._id,ambulance:vehicle._id,pickupLocation:{coordinates:[77,28]}}));
 trip.status="cancelled"; await trip.save();
 await Ambulance.findByIdAndUpdate(vehicle._id,{status:"idle"});
});
test("messages and events persist with ids; population does not overwrite foreign keys",async()=>{
 const trip=await Trip.create({patient:patient._id,pickupLocation:{coordinates:[77,28]}});
 trip.messages.push({sender:patient._id,senderRole:"patient",text:"Test",at:new Date()});
 trip.events.push({type:"test",at:new Date()}); await trip.save();
 assert.ok(trip.messages[0]._id);
 await trip.populate("patient","name");
 trip.address="New address"; await trip.save();
 const row=await Trip.findById(trip._id);
 assert.equal(row.patient,patient._id);
 assert.equal(row.messages[0].text,"Test");
 assert.ok(row.events[0]._id);
});
test("waitlist and SQL demand aggregation work",async()=>{
 const joined=await api("/coverage/waitlist",null,"POST",{pincodeOrArea:tag,contact:tag,consented:true});
 assert.equal(joined.status,201);
 const heatmap=await require("../src/data/prisma").waitlistEntry.groupBy({by:["pincodeOrArea"],_count:{_all:true},where:{pincodeOrArea:tag}});
 assert.equal(heatmap[0]._count._all,1);
});


test("socket events isolate simultaneous patient cases and recover after reconnect",async()=>{
 const {io}=require("../../frontend/node_modules/socket.io-client");
 const other=await User.create({name:tag+" other",email:tag+"-other@test.invalid",role:"patient"});ids.users.push(other._id);
 const trips=await Promise.all([patient,other].map(u=>Trip.create({patient:u._id,pickupLocation:{coordinates:[77,28]}})));
 const connect=async user=>{
  const socket=io("http://127.0.0.1:5051",{autoConnect:false,auth:{token:signAccessToken(user)},transports:["websocket"],reconnection:false});
  await new Promise((resolve,reject)=>{socket.once("connect",resolve);socket.once("connect_error",reject);socket.connect();});return socket;
 };
 const own=await connect(patient),outsider=await connect(other);let leaked=false;
 outsider.on("trip:message",()=>{leaked=true;});
 try{
  const denied=new Promise(resolve=>outsider.once("trip:access_denied",resolve));outsider.emit("join:trip",trips[0]._id);await denied;
  assert.equal((await api("/sos/"+trips[0]._id,other)).status,403);
  own.emit("join:trip",trips[0]._id);outsider.emit("join:trip",trips[1]._id);
  await new Promise(r=>setTimeout(r,80));
  const received=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("Event not delivered")),2000);own.once("trip:message",event=>{clearTimeout(timer);resolve(event);});});
  own.emit("trip:message:send",{tripId:trips[0]._id,text:"Synthetic socket isolation check"});
  assert.equal((await received).tripId,trips[0]._id);
  own.disconnect();own.connect();await new Promise(resolve=>own.once("connect",resolve));
  own.emit("join:trip",trips[0]._id);
  const restored=await api("/sos/"+trips[0]._id,patient);
  assert.equal(restored.data.trip.messages.at(-1).text,"Synthetic socket isolation check");
  assert.equal(leaked,false);
 }finally{own.disconnect();outsider.disconnect();}
});


test("routing and reverse-geocoding reject invalid coordinates and routing requires authentication",async()=>{
 assert.equal((await api("/routing/route",null,"POST",{start:[77,28],end:[77.1,28.1]})).status,401);
 assert.equal((await api("/routing/route",patient,"POST",{start:[999,28],end:[77,28]})).status,400);
 assert.equal((await api("/location/reverse?lat=not-a-number&lng=77")).status,400);
});
