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
let server, patient, driver, dispatcher, operator, vehicle;
const ids = { users: [], trips: [], ambulances: [], operators: [], waits: [] };
const base = "http://127.0.0.1:5051/api";
async function api(path, user, method = "GET", body) {
 const response = await fetch(base + path, { method, headers: { "Content-Type":"application/json", ...(user ? {Authorization:"Bearer "+signAccessToken(user)} : {}) }, ...(body ? {body: JSON.stringify(body)} : {}) });
 return { status: response.status, data: await response.json() };
}
before(async () => {
 for (const role of ["patient", "driver", "dispatcher"]) {
  const user = await User.create({ name: "परीक्षण " + role, email: role + tag + "@test.invalid", role });
  ids.users.push(user._id);
  if (role === "patient") patient = user;
  if (role === "driver") driver = user;
  if (role === "dispatcher") dispatcher = user;
 }
 operator = await prisma.operator.create({data:{name:tag,type:"ngo"}}); ids.operators.push(operator.id);
 vehicle = await Ambulance.create({ vehicleNumber:tag, operator:operator.id, tier:"ALS",status:"idle" }); ids.ambulances.push(vehicle._id);
 server = spawn(process.execPath, ["src/server.js"], {env:{...process.env,PORT:"5051"}, stdio:"pipe"});
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
 assert.equal((await api("/sos/"+trip._id,driver)).status,200);
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
