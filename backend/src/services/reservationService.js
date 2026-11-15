const prisma = require("../data/prisma");
// Both reservations commit together. A conflict rolls back the entire offer.
async function reserveAutoDispatch(tripId, ambulanceId, driverId, version, recommendation, expectedRequirements, mockSetup = null) {
  return prisma.$transaction(async tx => {
    const ambulance = await tx.ambulance.updateMany({
      where: { id: ambulanceId, status: "idle", version },
      data: { status: "dispatched", driverId, version: { increment: 1 }, ...(mockSetup && process.env.NODE_ENV !== "production" ? { location: mockSetup.location, equipment: mockSetup.equipment, lastPingAt: new Date() } : {}) },
    });
    if (!ambulance.count) return false;
    const trip = await tx.trip.findFirst({ where: {
      id: tripId, status: "requested", ambulanceId: null, autoDispatchAt: { lte: new Date() }
    }});
    if (trip && expectedRequirements && (
      trip.requestedAmbulanceTier !== expectedRequirements.requestedAmbulanceTier ||
      JSON.stringify(trip.triage) !== JSON.stringify(expectedRequirements.triage)
    )) throw Object.assign(new Error("Case requirements changed"), { status: 409 });
    if (!trip) throw Object.assign(new Error("Trip already assigned"), {status:409});
    const events = [...trip.events, {
      _id: require("crypto").randomUUID(), type: "ambulance:auto_offered", at: new Date().toISOString(),
      payload: {ambulanceId, driverId, ...recommendation},
    }];
    const assigned = await tx.trip.updateMany({
      where: {id:tripId, version:trip.version, status:"requested", ambulanceId:null},
      data: {ambulanceId,status:"offered",autoDispatchAt:new Date(Date.now() + (mockSetup ? 900_000 : 60_000)),events,version:{increment:1}},
    });
    if (!assigned.count) throw Object.assign(new Error("Trip already assigned"), {status:409});
    return true;
  });
}
module.exports = { reserveAutoDispatch };
