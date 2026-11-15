const router = require("express").Router();
const { createHash, randomBytes, randomUUID } = require("node:crypto");
const db = require("../data/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");
const { ambulanceCandidates, hospitalCandidates, distanceKm } = require("../services/matching");
const { eventsForJourney, fingerprint } = require("../services/journey");
const { kickOrchestration } = require("../services/autoDispatchService");

router.use(requireAuth);
const dispatch = requireRole("dispatcher", "admin");
const patient = requireRole("patient");
const receiving = requireRole("hospital");
const terminal = ["handed_off", "cancelled"];
const hash = token => createHash("sha256").update(token).digest("hex");

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

function route(handler) {
  return (req, res, next) => handler(req, res).catch(next);
}

async function findTrip(db, id) {
  const trip = await db.trip.findUnique({ where: { id }, include: { ambulance: true, hospital: true } });
  if (!trip) fail(404, "Case not found");
  return trip;
}

function active(trip) {
  if (terminal.includes(trip.status) || trip.status === "waitlisted") fail(409, "Case is not active");
}

async function record(tx, trip, req, type, payload, update = {}) {
  const result = await tx.trip.updateMany({
    where: { id: trip.id, version: trip.version },
    data: { ...update, version: { increment: 1 }, events: [...trip.events, {
      _id: randomUUID(), type, actorId: req.user.sub, at: new Date().toISOString(), payload,
    }] },
  });
  if (!result.count) fail(409, "Case changed. Refresh and retry.");
}

function notify(req, trip, hospitalId) {
  const io = req.app.get("io");
  let rooms = io?.to("dispatcher").to(`trip:${trip.id}`);
  if (trip.ambulance?.driverId) rooms = rooms?.to(`driver:${trip.ambulance.driverId}`);
  for (const id of new Set([hospitalId, trip.hospitalId].filter(Boolean))) rooms = rooms?.to(`hospital:${id}`);
  rooms?.emit("case:refresh", { tripId: trip.id });
  kickOrchestration(io);
}

router.get("/:id/destinations", dispatch, route(async (req, res) => {
  const trip = await findTrip(db, req.params.id);
  const [hospitals, referrals] = await Promise.all([
    db.hospital.findMany(),
    db.hospitalReferral.findMany({ where: { tripId: trip.id }, include: { hospital: true }, orderBy: { createdAt: "desc" } }),
  ]);
  res.json({ hospitals: hospitalCandidates(trip, hospitals), referrals, confirmed: trip.hospital });
}));

router.post("/:id/referrals", dispatch, route(async (req, res) => {
  const trip = await db.$transaction(async tx => {
    const trip = await findTrip(tx, req.params.id);
    active(trip);
    const hospital = await tx.hospital.findUnique({ where: { id: String(req.body.hospitalId) } });
    if (!hospital || !hospitalCandidates(trip, [hospital])[0].eligible) fail(409, "Hospital is unavailable");
    if (trip.hospitalId === hospital.id) fail(409, "This destination is already confirmed");
    const pending = await tx.hospitalReferral.findFirst({ where: { tripId: trip.id, status: { in: ["proposed", "accepted"] } } });
    if (pending) fail(409, "Resolve the existing referral first");
    const referral = await tx.hospitalReferral.create({ data: { tripId: trip.id, hospitalId: hospital.id } });
    await record(tx, trip, req, "hospital:proposed", { hospitalId: hospital.id, referralId: referral.id });
    return trip;
  });
  notify(req, trip, req.body.hospitalId);
  res.status(201).json({ ok: true });
}));

function demoHospital(req) {
  return process.env.NODE_ENV !== "production" && req.account.email === "hospital@sahay.org";
}

router.get("/hospital/referrals", receiving, route(async (req, res) => {
  if (!req.account.hospitalId) fail(403, "Hospital account required");
  const referrals = await db.hospitalReferral.findMany({
    where: {
      ...(demoHospital(req) ? { OR: [{ hospitalId: req.account.hospitalId }, { trip: { patient: { email: "patient@sahay.org" } } }] } : { hospitalId: req.account.hospitalId }),
      status: { in: ["proposed", "accepted", "confirmed", "cancelled"] }, trip: { OR: [{ status: { notIn: terminal } }, { status:"cancelled",updatedAt:{gte:new Date(Date.now()-86400000)} }] },
    },
    include: { hospital: { select: { name: true } }, trip: { select: { id: true, status: true, etaMinutes: true, etaSource: true, symptoms: true, triage: true, address: true, requestedAmbulanceTier: true, careDetails: true, updatedAt: true, events: true, ambulance: { select: { vehicleNumber: true } } } } },
    orderBy: { createdAt: "desc" },
  });
  res.json({ referrals });
}));

router.patch("/:id/referrals/:referralId", requireRole("hospital", "dispatcher", "admin"), route(async (req, res) => {
  const action = req.body.action;
  const { trip, referral } = await db.$transaction(async tx => {
    const trip = await findTrip(tx, req.params.id);
    active(trip);
    const referral = await tx.hospitalReferral.findFirst({ where: { id: req.params.referralId, tripId: trip.id } });
    if (!referral) fail(404, "Referral not found");
    const hospitalActor = req.user.role === "hospital";
    let update = {};
    let nextStatus = action;
    const demoPatient = demoHospital(req) && (await tx.user.findUnique({where:{id:trip.patientId},select:{email:true}}))?.email === "patient@sahay.org";
    if (hospitalActor && (req.account.hospitalId === referral.hospitalId || demoPatient) &&
        referral.status === "proposed" && ["accepted", "rejected"].includes(action)) {
      if (action === "accepted") {
        const candidate = await tx.hospital.findUnique({ where: { id: referral.hospitalId } });
        if (!candidate || !hospitalCandidates(trip, [candidate])[0].eligible) fail(409, "Hospital is unavailable or incompatible");
        const reservation = await tx.hospital.updateMany({
          where: { id: referral.hospitalId, bedsAvailable: { gt: 0 }, receivingReady: true, version: candidate.version },
          data: { bedsAvailable: { decrement: 1 }, version: { increment: 1 } },
        });
        if (!reservation.count) fail(409, "Hospital has no receiving capacity");
        if (!trip.hospitalId) {
          nextStatus = "confirmed";
          update = { hospitalId: referral.hospitalId };
        }
      }
    } else if (!hospitalActor && action === "withdrawn" && ["proposed", "accepted"].includes(referral.status)) {
      if (referral.status === "accepted") {
        await tx.hospital.update({ where: { id: referral.hospitalId }, data: { bedsAvailable: { increment: 1 }, version: { increment: 1 } } });
      }
    } else if (!hospitalActor && action === "confirmed" && referral.status === "accepted" && trip.status !== "arrived_hospital") {
      const hospital = await tx.hospital.findUnique({ where: { id: referral.hospitalId } });
      if (!hospital.receivingReady) fail(409, "Hospital is unavailable");
      if (trip.hospitalId) {
        const released = await tx.hospitalReferral.updateMany({ where: { tripId: trip.id, status: "confirmed" }, data: { status: "replaced" } });
        if (released.count) await tx.hospital.update({ where: { id: trip.hospitalId }, data: { bedsAvailable: { increment: 1 }, version: { increment: 1 } } });
      }
      update = { hospitalId: referral.hospitalId };
      if (trip.status === "en_route_hospital" && trip.ambulance) {
        update.etaMinutes = Math.ceil(distanceKm(trip.ambulance.location.coordinates, hospital.location.coordinates) * 2);
        update.etaSource = "straight_line";
      }
    } else {
      fail(403, "Referral action is not authorized");
    }
    const changed = await tx.hospitalReferral.updateMany({ where: { id: referral.id, status: referral.status }, data: { status: nextStatus } });
    if (!changed.count) fail(409, "Referral changed. Refresh and retry.");
    await record(tx, trip, req, `hospital:${action}`, { hospitalId: referral.hospitalId, referralId: referral.id }, update);
    if (nextStatus === "confirmed" && action === "accepted") {
      const acceptedTrip = await findTrip(tx, trip.id);
      await record(tx, acceptedTrip, req, "hospital:confirmed", { hospitalId: referral.hospitalId, referralId: referral.id });
    }
    return { trip, referral };
  });
  notify(req, trip, referral.hospitalId);
  res.json({ ok: true });
}));

router.get("/:id/invitations", patient, route(async (req, res) => {
  const trip = await findTrip(db, req.params.id);
  if (trip.patientId !== req.user.sub) fail(403, "Patient account required");
  const invitations = await db.caregiverAccess.findMany({ where: { tripId: trip.id },
    select: { id: true, email: true, expiresAt: true, revokedAt: true, userId: true } });
  res.json({ invitations });
}));

router.post("/:id/invitations", patient, route(async (req, res) => {
  const trip = await findTrip(db, req.params.id);
  if (trip.patientId !== req.user.sub) fail(403, "Patient account required");
  const email = String(req.body.email || "").trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, "Valid caregiver email required");
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 15 * 60_000);
  await db.caregiverAccess.create({ data: { tripId: trip.id, tokenHash: hash(token), email, expiresAt } });
  res.status(201).json({ token, expiresAt });
}));

router.delete("/:id/invitations/:invitation", patient, route(async (req, res) => {
  const trip = await findTrip(db, req.params.id);
  if (trip.patientId !== req.user.sub) fail(403, "Patient account required");
  await db.caregiverAccess.updateMany({ where: { id: req.params.invitation, tripId: trip.id, revokedAt: null }, data: { revokedAt: new Date() } });
  res.status(204).end();
}));

async function journeyData(trip, observations, caregiver = false) {
  const projection = await db.journeyProjection.findUnique({ where: { tripId: trip.id } });
  const events = eventsForJourney(trip, observations);
  const shared = eventsForJourney(trip, observations.filter(row => row.familyVisible));
  const refs = projection?.fingerprint === fingerprint(shared) ? projection.summary.highlights : [];
  const visible = events.filter(row => !caregiver || !row.type.startsWith("ambulance:") || row.type === "ambulance:accepted");
  return {
    status: trip.status,
    events: visible,
    observations,
    highlights: visible.filter(row => refs.includes(row.id)),
    coordination: projection?.fingerprint === fingerprint(shared) ? projection.coordination : null,
  };
}

router.get("/:id/journey", route(async (req, res) => {
  const trip = await findTrip(db, req.params.id);
  const role = req.user.role;
  const own = role === "patient" && trip.patientId === req.user.sub;
  const staff = ["hospital", "clinician"].includes(role) && (
    (req.account.hospitalId && req.account.hospitalId === trip.hospitalId) ||
    (trip.hospitalId && demoHospital(req) && (await db.user.findUnique({where:{id:trip.patientId},select:{email:true}}))?.email === "patient@sahay.org"));
  const driver = role === "driver" && trip.ambulance?.driverId === req.user.sub && !terminal.includes(trip.status);
  const dispatch = ["dispatcher", "admin"].includes(role);
  const grant = !own && !staff && !driver && !dispatch && await db.caregiverAccess.findFirst({
    where: { tripId: trip.id, userId: req.user.sub, revokedAt: null, expiresAt: { gt: new Date() } },
  });
  if (!own && !staff && !driver && !dispatch && !grant) fail(403, "Case access required");
  const observations = await db.clinicalObservation.findMany({
    where: { tripId: trip.id, ...(grant ? { familyVisible: true } : own || staff ? {} : { familyVisible: true }) },
    select: { id: true, type: true, note: true, createdAt: true, familyVisible: true },
  });
  res.json(await journeyData(trip, observations, !!grant));
}));

async function clinicianCase(req) {
  const trip = await findTrip(db, req.params.id);
  const hospital = !!trip.hospitalId && ((req.account.hospitalId && req.account.hospitalId === trip.hospitalId) ||
    (demoHospital(req) && (await db.user.findUnique({where:{id:trip.patientId},select:{email:true}}))?.email === "patient@sahay.org"));
  const driver = req.user.role === "driver" && trip.ambulance?.driverId === req.user.sub &&
    trip.ambulance.crew.some(member => member.userId === req.user.sub && member.certified === true);
  if (!hospital && !(driver && trip.status !== "offered")) fail(403, "Case-specific clinical authorization required");
  return trip;
}

router.get("/:id/observations", requireRole("hospital", "clinician", "driver"), route(async (req, res) => {
  const trip = await clinicianCase(req);
  const observations = await db.clinicalObservation.findMany({ where: { tripId: trip.id }, orderBy: { createdAt: "desc" } });
  res.json({ observations });
}));

router.post("/:id/observations", requireRole("hospital", "clinician", "driver"), route(async (req, res) => {
  const trip = await clinicianCase(req);
  if (["cancelled", "waitlisted"].includes(trip.status)) fail(409, "Case is not available for clinical recording");
  const { type, note, familyVisible } = req.body;
  if (["operation_plan","procedure_update"].includes(type) && !["hospital","clinician"].includes(req.user.role)) fail(403,"Hospital clinical staff must record operation updates");
  if (!["assessment", "vitals", "intervention_observed", "equipment_used", "handoff_observation","operation_plan","procedure_update"].includes(type) || typeof note !== "string" ||
      !note.trim() || note.length > 2000) fail(400, "Observation type and note are required");
  if (type === "intervention_observed" && !["picked_up","en_route_hospital","arrived_hospital","handed_off"].includes(trip.status)) {
    fail(409, "Confirm patient pickup before recording onboard treatment");
  }
  const observation = await db.clinicalObservation.create({
    data: { tripId: trip.id, actorId: req.user.sub, type, note: note.trim(), familyVisible: familyVisible === true },
  });
  notify(req, trip);
  res.status(201).json({ observation });
}));

router.get("/:id/specialist", route(async (req, res) => {
  const trip = await findTrip(db, req.params.id);
  const permitted = ["dispatcher", "admin"].includes(req.user.role) ||
    trip.patientId === req.user.sub || trip.ambulance?.driverId === req.user.sub ||
    (req.account.hospitalId && req.account.hospitalId === trip.hospitalId) ||
    (demoHospital(req) && (await db.user.findUnique({where:{id:trip.patientId},select:{email:true}}))?.email === "patient@sahay.org");
  if (!permitted) fail(403, "Case access required");
  const slot = await db.doctorSlot.findUnique({ where: { tripId: trip.id },
    include: { doctor: { select: { name: true, medicalProfile: true } } } });
  if (slot?.doctor) {
    const profile = slot.doctor.medicalProfile || {};
    slot.doctor.medicalProfile = {qualification:profile.qualification, specialties:profile.specialties, demo:profile.demo === true};
  }
  res.json({ slot, message: slot ? "Specialist slot reserved" :
    !trip.hospitalId ? "Awaiting confirmed hospital" : "Searching available specialist slots at the receiving hospital" });
}));

router.post("/hospital/specialists", receiving, route(async (req,res)=>{
  const { hospitalId, name, email, qualification, specialty, startsAt, endsAt } = req.body;
  const target = hospitalId || req.account.hospitalId;
  if (target !== req.account.hospitalId && !demoHospital(req)) fail(403,"Hospital membership required");
  if (![name,email,qualification,specialty].every(value=>typeof value==="string" && value.trim() && value.length<=200)) fail(400,"Doctor name, email, qualification and specialty are required");
  const start=new Date(startsAt),end=new Date(endsAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start<=new Date() || end<=start) fail(400,"Choose a valid future availability period");
  const cleanEmail=email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) fail(400,"Valid staff email required");
  const slot=await db.$transaction(async tx=>{
    let doctor=await tx.user.findUnique({where:{email:cleanEmail}});
    if(doctor && (doctor.role!=="clinician" || doctor.hospitalId!==target))fail(403,"Staff account belongs to another role or hospital");
    if(!doctor)doctor=await tx.user.create({data:{name:name.trim(),email:cleanEmail,role:"clinician",hospitalId:target,
      medicalProfile:{qualification:qualification.trim(),specialties:[specialty.trim()]}}});
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${doctor.id} FOR UPDATE`;
    if(await tx.doctorSlot.findFirst({where:{doctorId:doctor.id,startsAt:{lt:end},endsAt:{gt:start}}}))fail(409,"Doctor availability overlaps an existing slot");
    await tx.user.update({where:{id:doctor.id},data:{name:name.trim(),medicalProfile:{...doctor.medicalProfile,qualification:qualification.trim(),specialties:[...new Set([...(doctor.medicalProfile.specialties||[]),specialty.trim()])]}}});
    return tx.doctorSlot.create({data:{doctorId:doctor.id,specialty:specialty.trim(),startsAt:start,endsAt:end}});
  });
  kickOrchestration(req.app.get("io"));
  res.status(201).json({slot});
}));

router.post("/:id/replacement", requireRole("admin"), route(async(req,res)=>{
 const {ambulanceId,reason}=req.body;
 if(typeof ambulanceId!=="string" || typeof reason!=="string" || !reason.trim() || reason.length>500)fail(400,"Replacement ambulance and reason required");
 const result=await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM "Trip" WHERE id = ${req.params.id} FOR UPDATE`;
  const trip=await findTrip(tx,req.params.id);
  if(!["requested","offered","dispatched","en_route","arrived_pickup"].includes(trip.status))fail(409,"Replacement is available before patient pickup only");
  const vehicle=await tx.ambulance.findUnique({where:{id:ambulanceId},include:{operator:true,driver:true}});
  if(!vehicle || !vehicle.driver?.isActive || vehicle.driver.role!=="driver" || !ambulanceCandidates(trip,[vehicle])[0].eligible)fail(409,"Replacement ambulance is unavailable or incompatible");
  const busy=await tx.trip.findFirst({where:{id:{not:trip.id},status:{notIn:["cancelled","handed_off","waitlisted"]},ambulance:{driverId:vehicle.driverId}}});
  if(busy)fail(409,"Replacement driver already has an active case");
  const held=await tx.ambulance.updateMany({where:{id:vehicle.id,status:"idle",version:vehicle.version},data:{status:"dispatched",version:{increment:1}}});
  if(!held.count)fail(409,"Replacement availability changed");
  if(trip.ambulanceId)await tx.ambulance.update({where:{id:trip.ambulanceId},data:{status:"idle",version:{increment:1}}});
  await record(tx,trip,req,"ambulance:replacement_approved",{oldVehicleId:trip.ambulanceId,vehicleId:vehicle.id,reason:reason.trim()},
   {ambulanceId:vehicle.id,status:"offered",dispatchedAt:null,arrivedPickupAt:null,etaMinutes:null,autoDispatchAt:new Date(Date.now()+60000)});
  return {trip:await findTrip(tx,trip.id),driverId:vehicle.driverId,oldDriverId:trip.ambulance?.driverId};
 });
 const io=req.app.get("io");
 if(result.oldDriverId){io?.in(`driver:${result.oldDriverId}`).socketsLeave(`trip:${result.trip.id}`);io?.to(`driver:${result.oldDriverId}`).emit("case:refresh",{tripId:result.trip.id});}
 io?.to(`driver:${result.driverId}`).emit("case:refresh",{tripId:result.trip.id});
 notify(req,result.trip);
 res.json({ok:true});
}));

const detailSections = {
  health: { role: "patient", fields: ["allergies","medicines","conditions","emergencyContact","emergencyPhone"] },
  preparation: { role: "hospital", fields: ["entrance","dropoff","receivingDesk","contactNumber","receivingNurse","nurseAvailability","responsibleDoctor","treatmentRoom","doctorContact","doctorNotes","staffingNeeds","urgency","urgencyReason","expectedArrival"], checks: ["teamAssigned","bedReserved","equipmentReady","arrivalAcknowledged"] },
  handover: { role: "driver", fields: ["pulse","bloodPressure","oxygenSaturation","temperature","observations","treatmentGiven"] },
};

async function careAccess(tx, req) {
  const trip = await findTrip(tx, req.params.id);
  const referral = await tx.hospitalReferral.findFirst({
    where: { tripId: trip.id, status: { in: ["proposed","accepted","confirmed","cancelled"] } },
    orderBy: { createdAt: "desc" }, include: { hospital: { select: { id:true,name:true,address:true,erContact:true } } },
  });
  const destination = trip.hospital || referral?.hospital;
  const own = req.user.role === "patient" && trip.patientId === req.user.sub;
  const driver = req.user.role === "driver" && trip.ambulance?.driverId === req.user.sub && trip.status !== "offered";
  const hospital = req.user.role === "hospital" && destination && (
    req.account.hospitalId === destination.id ||
    (demoHospital(req) && (await tx.user.findUnique({where:{id:trip.patientId},select:{email:true}}))?.email === "patient@sahay.org"));
  if (!own && !driver && !hospital) fail(403,"Case-specific access required");
  return {trip,referral,destination};
}

function scopedDetails(trip, destination) {
  const details = { ...trip.careDetails };
  if (details.preparation?.hospitalId !== destination?.id) delete details.preparation;
  return details;
}

router.get("/:id/care-details", route(async(req,res)=>{
  const {trip,referral,destination} = await careAccess(db,req);
  const details = scopedDetails(trip,destination);
  const acceptance = trip.events.findLast(row=>row.type==="hospital:confirmed" || row.type==="hospital:accepted");
  const changes = trip.events.filter(row=>new Date(row.at)>=new Date(acceptance?.at || referral?.createdAt || trip.createdAt))
    .filter(row=>/^(status:|journey:eta_updated|journey:care_details|hospital:)/.test(row.type)).slice(-15);
  const observations = await db.clinicalObservation.findMany({where:{tripId:trip.id},select:{id:true,type:true,note:true,createdAt:true},orderBy:{createdAt:"desc"},take:20});
  const slot = await db.doctorSlot.findUnique({where:{tripId:trip.id},include:{doctor:{select:{name:true,phone:true,medicalProfile:true}}}});
  const assignedDoctor=slot?{name:slot.doctor.name,phone:slot.doctor.phone,qualification:slot.doctor.medicalProfile?.qualification,
    specialty:slot.specialty,startsAt:slot.startsAt,demo:slot.doctor.medicalProfile?.demo===true}:null;
  const healthReadings=await db.healthReading.findMany({where:{tripId:trip.id},orderBy:{measuredAt:"desc"},take:50,select:{id:true,source:true,values:true,measuredAt:true}});
  const expected = details.preparation?.expectedArrival;
  const delayed = trip.status==="en_route_hospital" && !!expected && new Date(expected)<new Date();
  res.json({ details, assignedDoctor, healthReadings, status:trip.status, hospital:destination && {id:destination.id,name:destination.name,address:destination.address,contact:destination.erContact},
    acknowledgement:referral?.status || (trip.hospitalId ? "confirmed" : "pending"), changes, observations, delayed,
    etaMinutes:trip.etaMinutes, etaSource:trip.etaSource, etaDestination:trip.status==="en_route_hospital" ? "hospital" : "pickup",
    etaUpdatedAt:trip.etaMinutes!=null ? trip.ambulance?.lastPingAt || trip.dispatchedAt : null, gpsLastSeen:trip.ambulance?.lastPingAt, lastUpdated:trip.updatedAt });
}));

router.patch("/:id/care-details", route(async(req,res)=>{
  const {section,revision,values} = req.body;
  const spec = detailSections[section];
  if (!spec || req.user.role!==spec.role) fail(403,"This section belongs to another role");
  if (!Number.isSafeInteger(revision) || revision<0 || !values || typeof values!=="object" || Array.isArray(values)) fail(400,"Section revision and values required");
  const fields = spec.fields || [], checks=spec.checks || [];
  if(Object.keys(values).some(key=>![...fields,...checks].includes(key)))fail(400,"Unknown care detail");
  for(const field of fields)if(values[field]!==undefined && (typeof values[field]!=="string" || values[field].length>1500))fail(400,"Care detail text is invalid or too long");
  for(const field of checks)if(values[field]!==undefined && typeof values[field]!=="boolean")fail(400,"Checklist values must be true or false");
  if(section==="preparation" && values.urgency && !["critical","urgent","standard","unassessed"].includes(values.urgency))fail(400,"Invalid recorded urgency");
  if(values.expectedArrival && !Number.isFinite(new Date(values.expectedArrival).getTime()))fail(400,"Invalid expected arrival");
  await db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "Trip" WHERE id = ${req.params.id} FOR UPDATE`;
    const {trip,destination}=await careAccess(tx,req);
    active(trip);
    if(section==="preparation" && req.body.hospitalId!==destination?.id)fail(409,"Receiving hospital changed. Reload before saving preparation.");
    const details=scopedDetails(trip,destination);
    if((details[section]?.revision || 0)!==revision)fail(409,"This section changed. Reload it before saving.");
    if(section==="preparation" && values.arrivalAcknowledged && !["arrived_hospital"].includes(trip.status))fail(409,"Hospital arrival must be recorded before acknowledging arrival");
    const saved={...details[section],...values,revision:revision+1,updatedAt:new Date().toISOString(),updatedBy:req.user.sub,
      ...(section==="preparation"?{hospitalId:destination.id}:{})};
    if(section==="handover"){
      saved.source="crew";
      const reading=Object.fromEntries(detailSections.handover.fields.map(field=>[field,saved[field]||""]));
      await tx.healthReading.create({data:{tripId:trip.id,actorId:req.user.sub,source:"crew",values:reading}});
    }
    await record(tx,trip,req,"journey:care_details",{section},{careDetails:{...details,[section]:saved}});
  });
  const {trip}=await careAccess(db,req);
  notify(req,trip);
  res.json({ok:true});
}));

module.exports = router;
