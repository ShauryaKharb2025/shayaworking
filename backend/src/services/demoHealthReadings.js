const db = require("../data/prisma");
async function updateDemoHealth(io, tripId) {
 if(process.env.NODE_ENV==="production")return;
 const trips=await db.trip.findMany({where:{id:tripId,patient:{email:"patient@sahay.org"},status:{in:["picked_up","en_route_hospital","arrived_hospital"]}}});
 for(const trip of trips){
  const previous=trip.careDetails?.handover;
  if(previous?.source==="crew" || (previous?.updatedAt && Date.now()-new Date(previous.updatedAt)<10000))continue;
  const pulse=[80,82,81][Math.floor(Date.now()/10000)%3];
  const values={pulse:String(pulse),bloodPressure:"120/80 mmHg",oxygenSaturation:"98%",temperature:"36.8 °C",
   observations:"Simulated demo monitor reading",treatmentGiven:previous?.treatmentGiven||""};
  const measuredAt=new Date();
  const changed=await db.$transaction(async tx=>{
   const updated=await tx.trip.updateMany({where:{id:trip.id,version:trip.version,status:trip.status},data:{
    version:{increment:1},careDetails:{...trip.careDetails,handover:{...previous,...values,source:"simulated",revision:(previous?.revision||0)+1,updatedAt:measuredAt.toISOString()}},
   }});
   if(updated.count)await tx.healthReading.create({data:{tripId:trip.id,source:"simulated",values,measuredAt}});
   return updated.count;
  });
  if(changed)io?.to(`trip:${trip.id}`).to("dispatcher").to(`hospital:${trip.hospitalId}`).emit("case:refresh",{tripId:trip.id});
 }
}
module.exports={updateDemoHealth};
