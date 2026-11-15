const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const db = require("../src/data/prisma");
const { bookSpecialist } = require("../src/services/specialistBooking");
after(() => db.$disconnect());

test("specialist booking waits for hospital confirmation, chooses earliest matching slot and releases on cancellation", async () => {
 const tag = randomUUID();
 const hospital = await db.hospital.create({data:{name:tag,location:{coordinates:[77,28]}}});
 const doctor = await db.user.create({data:{name:tag,email:tag+"@test.invalid",role:"clinician",hospitalId:hospital.id,medicalProfile:{qualification:"Test specialist",specialties:["Cardiology"]}}});
 const trips = [];
 try {
  for(let i=0;i<2;i++) trips.push(await db.trip.create({data:{patientId:doctor.id,hospitalId:hospital.id,pickupLocation:{coordinates:[77,28]},triage:{requiredSpecialties:["cardiology"]}}}));
  const startsAt = new Date(Date.now()+3600000), endsAt = new Date(Date.now()+7200000);
  await db.trip.updateMany({where:{id:{in:trips.map(t=>t.id)}},data:{hospitalId:null}});
  const slot = await db.doctorSlot.create({data:{doctorId:doctor.id,specialty:"Cardiology",startsAt,endsAt}});
  await db.doctorSlot.create({data:{doctorId:doctor.id,specialty:"neurology",startsAt:new Date(Date.now()+1800000),endsAt}});
  assert.equal(await bookSpecialist(trips[0].id),undefined);
  await db.hospitalReferral.create({data:{tripId:trips[0].id,hospitalId:hospital.id,status:"proposed"}});
  const early=await bookSpecialist(trips[0].id);
  assert.equal(early.id,slot.id,"Doctor is allocated with proposed hospital before pickup");

  await db.trip.updateMany({where:{id:{in:trips.map(t=>t.id)}},data:{status:"offered",hospitalId:hospital.id}});
  await Promise.all(trips.map(t=>bookSpecialist(t.id).catch(error=>{assert.ok(["P2002","P2034"].includes(error.code)||error.status===409);})));
  const booked=await db.doctorSlot.findUnique({where:{id:slot.id}});
  assert.ok(trips.some(t=>t.id===booked.tripId));
  assert.equal(await db.doctorSlot.count({where:{doctorId:doctor.id,tripId:{not:null}}}),1);
  await bookSpecialist(booked.tripId);
  await db.trip.update({where:{id:booked.tripId},data:{status:"cancelled"}});
  await bookSpecialist(booked.tripId);
  assert.equal((await db.doctorSlot.findUnique({where:{id:slot.id}})).tripId,null);
 } finally {
  await db.doctorSlot.deleteMany({where:{doctorId:doctor.id}});
  await db.hospitalReferral.deleteMany({where:{tripId:{in:trips.map(t=>t.id)}}});
  await db.trip.deleteMany({where:{id:{in:trips.map(t=>t.id)}}});
  await db.user.delete({where:{id:doctor.id}});
  await db.hospital.delete({where:{id:hospital.id}});
 }
});
