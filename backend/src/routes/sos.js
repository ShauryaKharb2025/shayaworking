const router = require("express").Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const { createSOS, getTrip, myTrips, cancelSOS } = require("../controllers/sosController");

router.post("/", requireAuth, requireRole("patient"), createSOS);
router.get("/", requireAuth, myTrips);
router.get("/:id", requireAuth, getTrip);
router.post("/:id/cancel", requireAuth, requireRole("patient", "dispatcher", "admin"), cancelSOS);
router.patch("/:id/cancel", requireAuth, requireRole("patient", "dispatcher", "admin"), cancelSOS);

module.exports = router;
