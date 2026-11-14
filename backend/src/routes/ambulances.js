const db = require("../data/prisma");
const router = require("express").Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const { createAmbulance, listAmbulances, updateAmbulance } = require("../controllers/ambulanceController");

router.post("/", requireAuth, requireRole("operator", "admin"), createAmbulance);
router.get("/", requireAuth, requireRole("operator", "dispatcher", "admin", "driver"), listAmbulances);
router.patch("/:id", requireAuth, requireRole("operator", "admin"), updateAmbulance);

router.get("/:id/operations", requireAuth, requireRole("operator", "admin"), async (req, res, next) => {
  try {
    const vehicle = await db.ambulance.findUnique({ where: { id: req.params.id } });
    if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });
    if (req.user.role === "operator" && req.account.operatorId !== vehicle.operatorId) {
      return res.status(403).json({ message: "Fleet membership required" });
    }
    const trips = await db.trip.findMany({ where: { ambulanceId: vehicle.id },
      select: { id: true, status: true, events: true, updatedAt: true },
      orderBy: { updatedAt: "desc" }, take: 30 });
    res.json({ trips: trips.map(trip => ({
      ...trip, events: trip.events.filter(event => event.type.startsWith("status:") || event.type.startsWith("ambulance:"))
        .map(({ type, at }) => ({ type, at })),
    })) });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
