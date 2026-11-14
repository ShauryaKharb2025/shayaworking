const router = require("express").Router();
const { requireAuth } = require("../middleware/auth");
const { createSOS, getTrip, myTrips } = require("../controllers/sosController");

router.post("/", requireAuth, createSOS);
router.get("/", requireAuth, myTrips);
router.get("/:id", requireAuth, getTrip);

module.exports = router;
