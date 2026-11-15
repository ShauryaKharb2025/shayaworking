const {test,after}=require("node:test");
const assert=require("node:assert/strict");
const db=require("../src/data/prisma");
const {updateDemoHealth}=require("../src/services/demoHealthReadings");
after(()=>db.$disconnect());
test("demo health feed records timestamped readings and stops when crew readings take over",async()=>{
 let patient=await db.user.findUnique({where:{email:"patient@sahay.org"}});
 const created=!patient;
 if(!patient)patient=await db.user.create({data:{email:"patient@sahay.org",name:"Synthetic demo patient",role:"patient"}});
 const trip=await db.trip.create({data:{patientId:patient.id,status:"picked_up",pickupLocation:{coordinates:[77,28]}}});
 try{
  await updateDemoHealth(null,trip.id);
  await updateDemoHealth(null,trip.id);
  const rows=await db.healthReading.findMany({where:{tripId:trip.id}});
  assert.equal(rows.length,1);
  assert.equal(rows[0].source,"simulated");
  assert.ok(rows[0].measuredAt);
  let current=await db.trip.findUnique({where:{id:trip.id}});
  assert.equal(current.careDetails.handover.source,"simulated");
  await db.trip.update({where:{id:trip.id},data:{careDetails:{...current.careDetails,handover:{pulse:"91",source:"crew",updatedAt:new Date(0).toISOString()}}}});
  await updateDemoHealth(null,trip.id);
  current=await db.trip.findUnique({where:{id:trip.id}});
  assert.equal(current.careDetails.handover.pulse,"91");
  assert.equal(await db.healthReading.count({where:{tripId:trip.id}}),1);
 }finally{
  await db.trip.delete({where:{id:trip.id}});
  if(created)await db.user.delete({where:{id:patient.id}});
 }
});
