const router = require("express").Router();
const rateLimit = require("express-rate-limit");
const prisma = require("../data/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");
const { ambulanceCandidates, hospitalCandidates } = require("../services/matching");
const { explain } = require("../services/geminiIntelligence");

router.use(requireAuth, requireRole("admin"));
router.use(rateLimit({ windowMs: 60_000, max: 40, keyGenerator: req => req.user.sub }));

const inputs = {
  async ambulance(trip) {
    const candidates = ambulanceCandidates(trip, await prisma.ambulance.findMany({ include: { operator: true } })).slice(0, 30);
    return { candidates: candidates.map(({ tier, eligible, reasons, distanceKm }, i) =>
      ({ ref: String(i + 1), tier, eligible, reasons, distanceKm })) };
  },
  async hospital(trip) {
    const hospitals = hospitalCandidates(trip, await prisma.hospital.findMany()).slice(0, 30);
    return { hospitals: hospitals.map(({ eligible, bedsAvailable, distanceKm }, i) =>
      ({ ref: String(i + 1), eligible, bedsAvailable, distanceKm })) };
  },
  async coordination(trip) {
    return { status: trip.status, simulatedEtaMinutes: trip.etaMinutes, hasConfirmedDestination: !!trip.hospitalId };
  },
  async journey(trip) {
    const observations = await prisma.clinicalObservation.findMany({
      where: { tripId: trip.id }, orderBy: { createdAt: "desc" }, take: 20,
      select: { id: true, type: true, createdAt: true },
    });
    return { events: [
      ...trip.events.slice(-40).map(({ type, at }, i) => ({ ref: String(i + 1), type, at })),
      ...observations.map(row => ({ ref: row.id, type: row.type, at: row.createdAt })),
    ] };
  },
};

for (const [name, buildInput] of Object.entries(inputs)) {
  router.post(`/trips/:id/${name}`, async (req, res, next) => {
    try {
      const trip = await prisma.trip.findUnique({ where: { id: req.params.id }, include: { ambulance: true } });
      if (!trip) return res.status(404).json({ message: "Case not found" });
      const input = await buildInput(trip);
      return res.json({ ...(await explain(name, input)), input });
    } catch (error) {
      next(error);
    }
  });
}

module.exports = router;
