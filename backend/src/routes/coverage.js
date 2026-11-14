const router = require("express").Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const {
  listZones,
  createZone,
  updateZoneStatus,
  joinWaitlist,
  demandHeatmap,
} = require("../controllers/coverageController");

router.get("/", listZones); // public coverage promise map
router.post("/", requireAuth, requireRole("admin"), createZone);
router.patch("/:id/status", requireAuth, requireRole("admin"), updateZoneStatus);
router.post("/waitlist", joinWaitlist); // public "Get Notified" form
router.get("/heatmap", requireAuth, requireRole("admin", "operator"), demandHeatmap);

module.exports = router;
