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
async function incomingTrips(req, res) {
  const trips = await Trip.find({
    hospital: req.params.id,
    status: { $in: ["en_route_hospital", "matched", "dispatched", "en_route"] },
  })
    .populate("patient", "name medicalProfile")
    .populate("ambulance");
  return res.json({ trips });
}

async function updateBeds(req, res) {
  const { bedsAvailable } = req.body;
  const hospital = await Hospital.findByIdAndUpdate(req.params.id, { bedsAvailable }, { new: true });
  return res.json({ hospital });
}

module.exports = { createHospital, listHospitals, incomingTrips, updateBeds };
