const prisma = require("../data/prisma");
// Both reservations commit together. A conflict rolls back the entire offer.
async function reserveAutoDispatch(tripId, ambulanceId, driverId) {
  return prisma.$transaction(async tx => {
    const ambulance = await tx.ambulance.updateMany({
      where: { id: ambulanceId, status: "idle" },
      data: { status: "dispatched", driverId, version: { increment: 1 } },
    });
    if (!ambulance.count) return false;
    const trip = await tx.trip.findFirst({ where: {
      id: tripId, status: "requested", ambulanceId: null, autoDispatchAt: { lte: new Date() }
    }});
    if (!trip) throw Object.assign(new Error("Trip already assigned"), {status:409});
    const events = [...trip.events, {
      _id: require("crypto").randomUUID(), type: "auto_dispatched", at: new Date().toISOString(),
      payload: {ambulanceId, driverId},
    }];
    const assigned = await tx.trip.updateMany({
      where: {id:tripId, version:trip.version, status:"requested", ambulanceId:null},
      data: {ambulanceId,status:"dispatched",dispatchedAt:new Date(),autoDispatchAt:null,events,version:{increment:1}},
    });
    if (!assigned.count) throw Object.assign(new Error("Trip already assigned"), {status:409});
    return true;
  });
}
module.exports = { reserveAutoDispatch };
