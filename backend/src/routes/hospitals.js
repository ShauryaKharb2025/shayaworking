const router = require("express").Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const {
  createHospital,
  listHospitals,
  incomingTrips,
  updateBeds,
} = require("../controllers/hospitalController");

router.post("/", requireAuth, requireRole("admin"), createHospital);
router.get("/", listHospitals); // public: useful for the coverage map
router.get("/:id/incoming", requireAuth, requireRole("hospital", "admin"), incomingTrips);
router.patch("/:id/beds", requireAuth, requireRole("hospital", "admin"), updateBeds);

module.exports = router;
