const router = require("express").Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const { createAmbulance, listAmbulances, updateAmbulance } = require("../controllers/ambulanceController");

router.post("/", requireAuth, requireRole("operator", "admin"), createAmbulance);
router.get("/", requireAuth, listAmbulances);
router.patch("/:id", requireAuth, requireRole("operator", "dispatcher", "admin"), updateAmbulance);

module.exports = router;
