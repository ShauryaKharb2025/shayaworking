const prisma = require("../data/prisma");
const { ambulanceCandidates } = require("./matching");
const { reserveAutoDispatch } = require("./reservationService");

async function processAutoDispatch(io) {
  const [trips, fleet] = await Promise.all([
    prisma.trip.findMany({ where: { status: "requested", autoDispatchAt: { lte: new Date() } }, orderBy: { autoDispatchAt: "asc" }, take: 20 }),
    prisma.ambulance.findMany({ where: { status: "idle", driver: { role: "driver", isActive: true } }, include: { operator: true } }),
  ]);
  for (const trip of trips) {
    for (const candidate of ambulanceCandidates(trip, fleet).filter(row => row.eligible)) {
      const vehicle = fleet.find(row => row.id === candidate.id);
      try {
        if (!await reserveAutoDispatch(trip.id, vehicle.id, vehicle.driverId, vehicle.version)) continue;
        const event = { tripId: trip.id };
        io?.to("dispatcher").to(`trip:${trip.id}`).to(`driver:${vehicle.driverId}`).emit("case:refresh", event);
        break;
      } catch (error) {
        if (error.status !== 409 && error.code !== "P2002") throw error;
      }
    }
  }
}

function startAutoDispatchWorker(io) {
  const run = () => processAutoDispatch(io).catch(error => console.error("[auto-dispatch]", error));
  run();
  setInterval(run, 10_000);
}

module.exports = { startAutoDispatchWorker };
