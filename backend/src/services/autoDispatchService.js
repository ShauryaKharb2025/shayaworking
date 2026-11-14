const { randomUUID } = require("node:crypto");
const db = require("../data/prisma");
const { ambulanceCandidates, hospitalCandidates } = require("./matching");
const { reserveAutoDispatch } = require("./reservationService");
const { explain } = require("./geminiIntelligence");
const { eventsForJourney, fingerprint } = require("./journey");

const terminal = ["waitlisted", "cancelled", "handed_off"];
const include = { hospital: true, ambulance: true, referrals: true, journeyProjection: true,
  observations: { select: { id: true, type: true, createdAt: true, familyVisible: true } } };
const workInterval = 2500;
let running = false;
let rerun = false;
const decisions = new Map();

function decideOnce(module, input, decide) {
  const key = module + JSON.stringify(input);
  const existing = decisions.get(key);
  if (existing && existing.until > Date.now()) return existing.result;
  if (decisions.size >= 128) decisions.delete(decisions.keys().next().value);
  const result = decide(module, input);
  decisions.set(key, { result, until: Date.now() + 15_000 });
  return result;
}

function notify(io, trip, hospitalId, driverId) {
  let room = io?.to("dispatcher").to(`trip:${trip.id}`);
  for (const id of new Set([hospitalId, trip.hospitalId].filter(Boolean))) room = room?.to(`hospital:${id}`);
  if (driverId || trip.ambulance?.driverId) room = room?.to(`driver:${driverId || trip.ambulance.driverId}`);
  room?.emit("case:refresh", { tripId: trip.id });
}

function event(type, payload) {
  return { _id: randomUUID(), at: new Date().toISOString(), type, payload };
}

async function append(tx, trip, entry, data = {}) {
  const written = await tx.trip.updateMany({ where: { id: trip.id, version: trip.version },
    data: { ...data, events: [...trip.events, entry], version: { increment: 1 } } });
  if (!written.count) throw Object.assign(new Error("Case changed"), { status: 409 });
}

function activeChooser(trip, kind) {
  return trip.events.filter(row => row.type === kind)
    .map(row => row.payload?.vehicleId || row.payload?.ambulanceId);
}

async function allocate(trip, io, decide) {
  if (!trip.autoDispatchAt || trip.autoDispatchAt > new Date()) return;
  if (trip.status === "offered") {
    const driverId = trip.ambulance?.driverId;
    await db.$transaction(async tx => {
      await append(tx, trip, event("ambulance:offer_expired", { vehicleId: trip.ambulanceId }),
        { status: "requested", ambulanceId: null, autoDispatchAt: new Date() });
      await tx.ambulance.update({ where: { id: trip.ambulanceId }, data: { status: "idle", version: { increment: 1 } } });
    });
    if (driverId) {
      io?.in(`driver:${driverId}`).socketsLeave(`trip:${trip.id}`);
      io?.to(`driver:${driverId}`).emit("case:refresh", { tripId: trip.id });
    }
    io?.to("driver").emit("case:refresh", { tripId: trip.id });
    notify(io, trip);
    return;
  }
  if (trip.status !== "requested") return;
  await db.ambulance.updateMany({
    where: {
      status: "dispatched",
      trips: {
        none: {
          status: { in: ["offered", "dispatched", "en_route", "arrived_pickup", "picked_up", "en_route_hospital", "arrived_hospital"] },
        },
      },
    },
    data: { status: "idle" },
  });
  const fleet = await db.ambulance.findMany({ where: { status: "idle", driver: { role: "driver", isActive: true } }, include: { operator: true } });
  const excluded = [...activeChooser(trip, "ambulance:offer_expired"), ...activeChooser(trip, "ambulance:rejected")];
  const candidates = ambulanceCandidates(trip, fleet).filter(row => row.eligible && !excluded.includes(row.id)).slice(0, 8)
    .map(row => {
      const vehicle = fleet.find(item => item.id === row.id);
      return { id: row.id, tier: row.tier, fleetVerified: vehicle.operator.verified, simulatedPickupMinutes: Math.ceil(row.distanceKm * 2),
        equipment: vehicle.equipment, crew: vehicle.crew.map(({ role, certified }) => ({ role, certified })),
        gpsAgeSeconds: vehicle.lastPingAt && Math.floor((Date.now() - vehicle.lastPingAt) / 1000) };
    });
  if (!candidates.length) return;
  const decision = await decideOnce("ambulanceDecision", { candidates, coverage: trip.coverageState,
    reasonCodes: ["pickup_eta", "gps_freshness", "capability"], requiredTier: trip.requestedAmbulanceTier, requiredEquipment: trip.triage?.suggestedEquipment || [], versions: candidates.map(row => fleet.find(item => item.id === row.id).version) }, decide);
  const preference = [...new Set([...(decision.output?.rankedIds || []), ...candidates.map(row => row.id)])];
  for (const id of preference) {
    const vehicle = fleet.find(item => item.id === id);
    if (await reserveAutoDispatch(trip.id, id, vehicle.driverId, vehicle.version, {
      preferenceSource: decision.source, reasonCode: id === decision.output?.chosenId ? decision.output.reasonCode : "pickup_eta",
    }, trip)) {
      const updatedTrip = await db.trip.findUnique({
        where: { id: trip.id },
        include: { ...include, patient: { select: { id: true, name: true, phone: true } } },
      });
      const formattedTrip = updatedTrip ? {
        ...updatedTrip,
        _id: updatedTrip.id,
        patient: updatedTrip.patient ? { ...updatedTrip.patient, _id: updatedTrip.patient.id } : null,
        hospital: updatedTrip.hospital ? { ...updatedTrip.hospital, _id: updatedTrip.hospital.id } : null,
      } : trip;
      const formattedAmbulance = vehicle ? { ...vehicle, _id: vehicle.id } : null;

      if (vehicle.driverId) {
        io?.to(`driver:${vehicle.driverId}`).emit("trip:assigned", { tripId: trip.id, ambulance: formattedAmbulance, trip: formattedTrip });
        io?.to(`driver:${vehicle.driverId}`).emit("trip:matched", { tripId: trip.id, ambulance: formattedAmbulance, trip: formattedTrip });
      }
      io?.to("driver").emit("trip:assigned", { tripId: trip.id, ambulance: formattedAmbulance, trip: formattedTrip });
      notify(io, updatedTrip || trip, null, vehicle.driverId);
      return;
    }
  }
}

async function refer(trip, io, decide) {
  if (terminal.includes(trip.status) || trip.status === "arrived_hospital") return;
  if (trip.hospital?.receivingReady) return;
  const pending = trip.referrals.find(row => ["proposed", "accepted"].includes(row.status));
  if (pending) {
    const hospital = await db.hospital.findUnique({ where: { id: pending.hospitalId } });
    const expired = pending.status === "proposed" && Date.now() - pending.createdAt.getTime() >= 120_000;
    if (!expired && hospital?.receivingReady && (pending.status === "accepted" || hospital.bedsAvailable > 0)) return;
    await db.$transaction(async tx => {
      await append(tx, trip, event(expired ? "hospital:referral_expired" : "hospital:referral_unavailable", { hospitalId: pending.hospitalId }));
      await tx.hospitalReferral.update({ where: { id: pending.id }, data: { status: "withdrawn" } });
      if (pending.status === "accepted") await tx.hospital.update({ where: { id: pending.hospitalId },
        data: { bedsAvailable: { increment: 1 }, version: { increment: 1 } } });
    });
    notify(io, trip, pending.hospitalId);
    return;
  }
  const rejected = trip.referrals.filter(row => row.status === "rejected").map(row => row.hospitalId);
  const expired = trip.events.filter(row => row.type === "hospital:referral_expired").map(row => row.payload.hospitalId);
  const hospitals = await db.hospital.findMany({ where: { receivingReady: true, bedsAvailable: { gt: 0 },
    id: { notIn: [...rejected, ...expired, trip.hospitalId].filter(Boolean) } } });
  const candidates = hospitalCandidates(trip, hospitals).filter(row => row.eligible).slice(0, 8)
    .map(({ id, specialties, bedsAvailable, distanceKm: km }) => ({ id, specialties, bedsAvailable, simulatedTravelMinutes: Math.ceil(km * 2) }));
  if (!candidates.length) return;
  const choice = await decideOnce("hospitalDecision", { candidates, requiredSpecialties: trip.triage?.requiredSpecialties || [], reasonCodes: ["travel_eta", "capacity", "specialty"], versions: candidates.map(row => hospitals.find(item => item.id === row.id).version) }, decide);
  const selected = hospitals.find(row => row.id === (choice.output?.chosenId || candidates[0].id));
  await db.$transaction(async tx => {
    const current = await tx.trip.findUnique({ where: { id: trip.id }, include: { hospital: true } });
    if (terminal.includes(current.status) || current.status === "arrived_hospital" ||
        current.hospitalId !== trip.hospitalId || current.hospital?.receivingReady ||
        JSON.stringify(current.triage) !== JSON.stringify(trip.triage)) return;
    const competing = await tx.hospitalReferral.findFirst({ where: { tripId: trip.id, status: { in: ["proposed", "accepted"] } } });
    if (competing) return;
    const currentHospital = await tx.hospital.findUnique({ where: { id: selected.id } });
    if (!currentHospital.receivingReady || currentHospital.bedsAvailable <= 0 || currentHospital.version !== selected.version) return;
    const referral = await tx.hospitalReferral.create({ data: { tripId: trip.id, hospitalId: selected.id } });
    await append(tx, current, event("hospital:automatically_proposed", {
      hospitalId: selected.id, referralId: referral.id, preferenceSource: choice.source,
      reasonCode: choice.output?.reasonCode || "travel_eta",
    }));
  });
  notify(io, trip, selected.id);
}

const actions = {
  requested: ["finding_ambulance", "review_availability"],
  offered: ["awaiting_driver", "monitor_acknowledgement"],
  dispatched: ["preparing_pickup"],
  en_route: ["monitor_pickup", "review_pickup_eta"],
  arrived_pickup: ["awaiting_pickup"],
  picked_up: ["prepare_transport"],
  en_route_hospital: ["monitor_transport"],
  arrived_hospital: ["awaiting_handoff"],
  handed_off: ["handoff_recorded"],
  cancelled: ["case_cancelled"],
};

async function project(trip, io, decide) {
  const events = eventsForJourney(trip, trip.observations.filter(row => row.familyVisible));
  const key = fingerprint(events);
  if (trip.journeyProjection?.fingerprint === key) return;
  const allowedActions = actions[trip.status] || ["monitor_case"];
  const [coordination, digest] = await Promise.all([
    decide("coordinationDecision", { status: trip.status, simulatedEtaMinutes: trip.etaMinutes,
      destinationConfirmed: !!trip.hospitalId, allowedActions }),
    decide("journeyDigest", { events: events.slice(-20) }),
  ]);
  const latest = await db.trip.findUnique({ where: { id: trip.id }, include });
  if (!latest || latest.status !== trip.status ||
      fingerprint(eventsForJourney(latest, latest.observations.filter(row => row.familyVisible))) !== key) return;
  const refs = new Set(digest.output?.evidenceRefs || events.slice(-4).map(row => row.id));
  const summary = {
    highlights: events.filter(row => refs.has(row.id)).map(row => row.id),
    sources: { coordination: coordination.source, journey: digest.source },
  };
  const data = { fingerprint: key, coordination: coordination.output?.action || allowedActions[0], summary };
  await db.journeyProjection.upsert({ where: { tripId: trip.id }, create: { tripId: trip.id, ...data }, update: data });
  notify(io, trip);
}

async function processOrchestration(io, decide = explain, tripId) {
  const trips = await db.trip.findMany({
    where: { id: tripId, coverageState: { in: ["live", "limited"] }, OR: [
      { status: { notIn: terminal } }, { updatedAt: { gte: new Date(Date.now() - 3_600_000) } },
    ] }, include, orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
  });
  // A validated coordination action prioritizes operational review within each worker pass.
  const priority = trip => ["review_availability", "review_pickup_eta"].includes(trip.journeyProjection?.coordination) ? 0 : 1;
  trips.sort((a, b) => priority(a) - priority(b));
  for (let i = 0; i < trips.length; i += 2) {
    await Promise.all(trips.slice(i, i + 2).map(async trip => {
      const tasks = terminal.includes(trip.status) ? [] : [allocate(trip, io, decide), refer(trip, io, decide)];
      const results = await Promise.allSettled(tasks);
      for (const result of results) {
        if (result.status === "rejected" && result.reason.status !== 409 && result.reason.code !== "P2002") {
          console.error("[orchestration] allocation failed", result.reason.code || result.reason.name);
        }
      }
      const latest = await db.trip.findUnique({ where: { id: trip.id }, include });
      if (latest) await project(latest, io, decide);
    }));
  }
}

function kickOrchestration(io) {
  if (process.env.ORCHESTRATION_ENABLED === "false") return;
  if (running) { rerun = true; return; }
  running = true;
  processOrchestration(io).catch(error => console.error("[orchestration] worker failed", error.code || error.name)).finally(() => {
    running = false;
    if (rerun) {
      rerun = false;
      setImmediate(() => kickOrchestration(io));
    }
  });
}

function startAutoDispatchWorker(io) {
  kickOrchestration(io);
  setInterval(() => kickOrchestration(io), workInterval).unref();
}

module.exports = { startAutoDispatchWorker, kickOrchestration, processOrchestration };
