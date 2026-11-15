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
 const response = await fetch(base + path, { method, headers: { "Content-Type":"application/json", ...(user ? {Authorization:"Bearer "+signAccessToken(user)} : {}) }, ...(body ? {body: JSON.stringify(body)} : {}) });
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
 for(let i=0;i<60;i++) {
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
test("referral replacement, caregiver revocation and clinical handoff persist", async () => {
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
  const expired = await api(path+"/invitations",patient,"POST",{email:caregiver.email});
  assert.equal(expired.status,201);
  await prisma.caregiverAccess.updateMany({where:{tripId:id},data:{expiresAt:new Date(0)}});
  assert.equal((await api("/cases/caregiver/redeem",caregiver,"POST",{token:expired.data.token})).status,403);
  const invitation = await api(path+"/invitations",patient,"POST",{email:caregiver.email});
  assert.equal(invitation.status,201);
  assert.equal((await api("/cases/caregiver/redeem",caregiver,"POST",{token:invitation.data.token})).status,200);
  assert.equal((await api(path+"/caregiver",caregiver)).status,200);
  const observation = {type:"vitals",note:"Synthetic measurement observed",familyVisible:true};
  assert.equal((await api(path+"/observations",patient,"POST",observation)).status,403);
  assert.equal((await api(path+"/observations",clinician,"POST",observation)).status,201);
  assert.equal((await api(path+"/caregiver",caregiver)).data.observations[0].note,observation.note);
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

  const grants = await api(path+"/invitations",patient);
  assert.equal((await fetch(base+path+"/invitations/"+grants.data.invitations.find(row=>row.userId===caregiver._id).id,{ method:"DELETE",headers:{Authorization:"Bearer "+signAccessToken(patient)} })).status,204);
  assert.equal((await api(path+"/caregiver",caregiver)).status,403);
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
  for (const model of [prisma.clinicalObservation,prisma.caregiverAccess,prisma.hospitalReferral]) {
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
