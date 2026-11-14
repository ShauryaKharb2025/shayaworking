const Hospital = require("../models/Hospital");
const Trip = require("../models/Trip");

async function createHospital(req, res) {
  const hospital = await Hospital.create(req.body);
  return res.status(201).json({ hospital });
}

async function listHospitals(req, res) {
  const hospitals = await Hospital.find();
  return res.json({ hospitals });
}

/** GET /api/hospitals/:id/incoming - ER pre-alert dashboard: incoming trips + bed status */
function canManage(req) {
  return req.user.role === "admin" || req.account.hospitalId === req.params.id;
}

async function incomingTrips(req, res, next) {
  if (!canManage(req)) return res.status(403).json({ message: "Hospital membership required" });
  try {
    const trips = await Trip.find({
    hospital: req.params.id,
    status: { $in: ["en_route_hospital", "arrived_hospital", "dispatched", "en_route", "arrived_pickup", "picked_up"] },
  })
    .populate("patient", "name medicalProfile")
    .populate("ambulance");
    return res.json({ trips });
  } catch (error) {
    next(error);
  }
}

async function updateBeds(req, res, next) {
  if (!canManage(req)) return res.status(403).json({ message: "Hospital membership required" });
  const { bedsAvailable, receivingReady, specialties } = req.body;
  if (!Number.isSafeInteger(bedsAvailable) || bedsAvailable < 0 || bedsAvailable > 100000 ||
      (receivingReady !== undefined && typeof receivingReady !== "boolean") ||
      (specialties !== undefined && (!Array.isArray(specialties) || specialties.some(item => typeof item !== "string")))) {
    return res.status(400).json({ message: "Invalid capacity or capability details" });
  }
  try {
    const hospital = await Hospital.findByIdAndUpdate(req.params.id, { bedsAvailable, receivingReady, specialties }, { new: true });
    if (!hospital) return res.status(404).json({ message: "Hospital not found" });
    req.app.get("io")?.to("dispatcher").emit("case:refresh");
    require("../services/autoDispatchService").kickOrchestration(req.app.get("io"));
    return res.json({ hospital });
  } catch (error) {
    next(error);
  }
}

module.exports = { createHospital, listHospitals, incomingTrips, updateBeds };
