const router = require("express").Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const { createSOS, getTrip, myTrips } = require("../controllers/sosController");

router.post("/", requireAuth, requireRole("patient"), createSOS);
router.get("/", requireAuth, myTrips);
router.get("/:id", requireAuth, getTrip);

module.exports = router;
