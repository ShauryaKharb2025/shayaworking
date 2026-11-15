const db = require("../data/prisma");
const { randomUUID } = require("node:crypto");

async function bookSpecialist(tripId) {
  if (process.env.NODE_ENV !== "production") {
    const demo = await db.trip.findUnique({where:{id:tripId},include:{patient:true,referrals:{where:{status:{in:["proposed","accepted"]}},orderBy:{createdAt:"desc"},take:1}}});
    const specialty = demo?.triage?.requiredSpecialties?.[0];
    const demoHospitalId=demo?.hospitalId || demo?.referrals?.[0]?.hospitalId;
    if(demoHospitalId && demo.patient.email==="patient@sahay.org" && specialty && !["cancelled","handed_off"].includes(demo.status)){
      const email="demo-specialist-"+require("node:crypto").createHash("sha256").update(demoHospitalId+specialty).digest("hex").slice(0,20)+"@sahay.local";
      const doctor=await db.user.upsert({where:{email},update:{},create:{
        email,name:"Demo specialist · "+specialty,role:"clinician",hospitalId:demoHospitalId,
        medicalProfile:{qualification:"Synthetic demo specialist",specialties:[specialty],demo:true},
      }});
      const start=new Date(Math.ceil((Date.now()+15*60000)/(15*60000))*15*60000);
      for(let offset=0;offset<8;offset++){
        const startsAt=new Date(start.getTime()+offset*15*60000);
        await db.doctorSlot.upsert({where:{doctorId_startsAt:{doctorId:doctor.id,startsAt}},update:{},create:{
          doctorId:doctor.id,specialty,startsAt,endsAt:new Date(startsAt.getTime()+15*60000),
        }});
      }
    }
  }
  return db.$transaction(async tx => {
    const trip = await tx.trip.findUnique({ where: { id: tripId },include:{referrals:{where:{status:{in:["proposed","accepted"]}},orderBy:{createdAt:"desc"},take:1}} });
    if (!trip) return;
    const hospitalId=trip.hospitalId || trip.referrals[0]?.hospitalId;
    const existing = await tx.doctorSlot.findUnique({ where: { tripId } });
    if (existing) {
      const doctor = await tx.user.findUnique({ where: { id: existing.doctorId } });
      if (trip.status === "cancelled" || doctor?.hospitalId !== hospitalId ||
          !doctor?.isActive || (existing.endsAt < new Date() && !["arrived_hospital","handed_off"].includes(trip.status))) {
        await tx.doctorSlot.update({ where: { id: existing.id }, data: { tripId: null } });
      } else return existing;
    }
    if (!["requested","offered","dispatched","en_route","arrived_pickup","picked_up","en_route_hospital","arrived_hospital"].includes(trip.status)) return;
    if (!hospitalId) return;
    const specialties = trip.triage?.requiredSpecialties || [];
    if (!specialties.length) return;
    const arrival = new Date(Date.now() + Math.max(0, trip.etaMinutes || 0) * 60000);
    const slots = await tx.doctorSlot.findMany({
      where: { tripId: null, specialty: { in: specialties, mode: "insensitive" }, startsAt: { gte: arrival },
        doctor: { isActive: true, role: "clinician", hospitalId } },
      include: { doctor: { select: { medicalProfile: true } } },
      orderBy: [{ startsAt: "asc" }, { id: "asc" }], take: 20,
    });
    for (const slot of slots) {
      const qualifications = slot.doctor.medicalProfile?.specialties || [];
      if (!specialties.every(required => qualifications.some(item => item.toLowerCase() === required.toLowerCase()))) continue;
      const reserved = await tx.doctorSlot.updateMany({ where: { id: slot.id, tripId: null }, data: { tripId } });
      if (!reserved.count) continue;
      const updated = await tx.trip.updateMany({
        where: { id: tripId, version: trip.version, hospitalId: trip.hospitalId, status: trip.status },
        data: { version: { increment: 1 }, events: [...trip.events, {
          _id: randomUUID(), type: "journey:specialist_reserved", at: new Date().toISOString(),
          payload: { slotId: slot.id, doctorId: slot.doctorId, startsAt: slot.startsAt, specialty: slot.specialty },
        }] },
      });
      if (!updated.count) throw Object.assign(new Error("Case changed during slot booking"), { status: 409 });
      return slot;
    }
  });
}
module.exports = { bookSpecialist };
