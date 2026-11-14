const router = require("express").Router();
const { createHash, randomBytes, randomUUID } = require("node:crypto");
const db = require("../data/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");
const { hospitalCandidates, distanceKm } = require("../services/matching");
const { explain } = require("../services/geminiIntelligence");

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
    if (!hospital?.receivingReady || hospital.bedsAvailable <= 0) fail(409, "Hospital is unavailable");
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

router.get("/hospital/referrals", receiving, route(async (req, res) => {
  if (!req.account.hospitalId) fail(403, "Hospital account required");
  const referrals = await db.hospitalReferral.findMany({
    where: { hospitalId: req.account.hospitalId, status: { in: ["proposed", "accepted", "confirmed"] }, trip: { status: { notIn: terminal } } },
    include: { trip: { select: { id: true, status: true, etaMinutes: true } } },
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
    if (hospitalActor && req.account.hospitalId === referral.hospitalId &&
        referral.status === "proposed" && ["accepted", "rejected"].includes(action)) {
      if (action === "accepted") {
        const reservation = await tx.hospital.updateMany({
          where: { id: referral.hospitalId, bedsAvailable: { gt: 0 }, receivingReady: true },
          data: { bedsAvailable: { decrement: 1 }, version: { increment: 1 } },
        });
        if (!reservation.count) fail(409, "Hospital has no receiving capacity");
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
      }
    } else {
      fail(403, "Referral action is not authorized");
    }
    const changed = await tx.hospitalReferral.updateMany({ where: { id: referral.id, status: referral.status }, data: { status: action } });
    if (!changed.count) fail(409, "Referral changed. Refresh and retry.");
    await record(tx, trip, req, `hospital:${action}`, { hospitalId: referral.hospitalId, referralId: referral.id }, update);
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

router.post("/caregiver/redeem", requireRole("patient", "caregiver"), route(async (req, res) => {
  const token = req.body.token;
  if (typeof token !== "string" || token.length !== 43) fail(400, "Invalid invitation");
  const invitation = await db.caregiverAccess.findUnique({ where: { tokenHash: hash(token) } });
  if (!invitation || invitation.email !== req.account.email.toLowerCase()) fail(403, "Invitation unavailable");
  const result = await db.caregiverAccess.updateMany({
    where: { id: invitation.id, revokedAt: null, userId: null, expiresAt: { gt: new Date() } },
    data: { userId: req.user.sub, expiresAt: new Date(Date.now() + 24 * 60 * 60_000) },
  });
  if (!result.count) fail(403, "Invitation expired, revoked or already used");
  res.json({ tripId: invitation.tripId });
}));

router.delete("/:id/invitations/:invitation", patient, route(async (req, res) => {
  const trip = await findTrip(db, req.params.id);
  if (trip.patientId !== req.user.sub) fail(403, "Patient account required");
  await db.caregiverAccess.updateMany({ where: { id: req.params.invitation, tripId: trip.id, revokedAt: null }, data: { revokedAt: new Date() } });
  res.status(204).end();
}));

async function caregiverJourney(req) {
  const grant = await db.caregiverAccess.findFirst({
    where: { tripId: req.params.id, userId: req.user.sub, revokedAt: null, expiresAt: { gt: new Date() } },
  });
  if (!grant) fail(403, "Caregiver access is unavailable");
  const trip = await findTrip(db, req.params.id);
  const [proposal, observations] = await Promise.all([
    db.hospitalReferral.findFirst({ where: { tripId: trip.id, status: { in: ["proposed", "accepted"] } }, include: { hospital: true } }),
    db.clinicalObservation.findMany({ where: { tripId: trip.id, familyVisible: true }, orderBy: { createdAt: "desc" }, take: 40,
      select: { type: true, note: true, createdAt: true } }),
  ]);
  const ambulance = trip.status === "offered" ? null : trip.ambulance;
  const events = trip.events.filter(event => event.type.startsWith("status:"))
    .map(({ type, at }) => ({ type, at }));
  return {
    status: trip.status, simulatedEtaMinutes: trip.etaMinutes,
    ambulance: ambulance && { vehicleNumber: ambulance.vehicleNumber, equipment: ambulance.equipment,
      complianceVerified: ambulance.complianceVerified, location: ambulance.location,
      crew: ambulance.crew.map(({ role, certified }) => ({ role, certified })) },
    proposed: proposal?.hospital.name, confirmed: trip.hospital?.name, events, observations,
  };
}

router.get("/caregiver/cases", requireRole("patient", "caregiver"), route(async (req, res) => {
  const grants = await db.caregiverAccess.findMany({ where: { userId: req.user.sub, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { tripId: true }, distinct: ["tripId"] });
  res.json({ grants });
}));

router.get("/:id/caregiver", requireRole("patient", "caregiver"), route(async (req, res) => {
  res.json(await caregiverJourney(req));
}));

router.post("/:id/caregiver/summary", require("express-rate-limit")({ windowMs: 60_000, max: 12, keyGenerator: req => req.user.sub }), requireRole("patient", "caregiver"), route(async (req, res) => {
  const journey = await caregiverJourney(req);
  const input = { events: journey.events.slice(-30).map(({ type, at }, index) => ({ ref: String(index + 1), type, at })) };
  const summary = await explain("journey", input);
  await caregiverJourney(req);
  res.json(summary);
}));

async function clinicianCase(req) {
  const trip = await findTrip(db, req.params.id);
  const hospital = req.account.hospitalId && req.account.hospitalId === trip.hospitalId;
  const driver = req.user.role === "driver" && trip.ambulance?.driverId === req.user.sub &&
    trip.ambulance.crew.some(member => member.userId === req.user.sub && member.certified === true);
  if (!hospital && !(driver && trip.status !== "offered")) fail(403, "Case-specific clinical authorization required");
  return trip;
}

router.get("/:id/observations", requireRole("clinician", "driver"), route(async (req, res) => {
  const trip = await clinicianCase(req);
  const observations = await db.clinicalObservation.findMany({ where: { tripId: trip.id }, orderBy: { createdAt: "desc" } });
  res.json({ observations });
}));

router.post("/:id/observations", requireRole("clinician", "driver"), route(async (req, res) => {
  const trip = await clinicianCase(req);
  active(trip);
  const { type, note, familyVisible } = req.body;
  if (!["assessment", "vitals", "intervention_observed"].includes(type) || typeof note !== "string" ||
      !note.trim() || note.length > 2000) fail(400, "Observation type and note are required");
  const observation = await db.clinicalObservation.create({
    data: { tripId: trip.id, actorId: req.user.sub, type, note: note.trim(), familyVisible: familyVisible === true },
  });
  notify(req, trip);
  res.status(201).json({ observation });
}));

module.exports = router;
