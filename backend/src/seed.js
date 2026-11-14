/**
 * Optional demo-data seeder. Run with: `npm run seed` (from backend/)
 * Creates one operator, a couple of ambulances, one hospital, and coverage zones
 * so the frontend has something to show right after setup.
 */
require("dotenv").config();
const connectDB = require("./config/db");
const Operator = require("./models/Operator");
const Ambulance = require("./models/Ambulance");
const Hospital = require("./models/Hospital");
const CoverageZone = require("./models/CoverageZone");

async function seed() {
  await connectDB();

  const operator = await Operator.findOneAndUpdate(
    { name: "Sewa Ambulance Trust" },
    { name: "Sewa Ambulance Trust", type: "ngo", verified: true, city: "Patna" },
    { upsert: true, new: true }
  );

  const hospital = await Hospital.findOneAndUpdate(
    { name: "Patna Medical College Hospital" },
    {
      name: "Patna Medical College Hospital",
      address: "Ashok Rajpath, Patna",
      location: { type: "Point", coordinates: [85.1414, 25.6127] },
      specialties: ["trauma", "cardiology"],
      bedsAvailable: 4,
      erContact: "+91-000-0000",
    },
    { upsert: true, new: true }
  );

  await Ambulance.findOneAndUpdate(
    { vehicleNumber: "BR01-AB-1234" },
    {
      vehicleNumber: "BR01-AB-1234",
      operator: operator._id,
      tier: "ALS",
      equipment: ["oxygen", "defibrillator", "ventilator"],
      crew: [{ name: "R. Kumar", role: "EMT", certified: true }],
      status: "idle",
      location: { type: "Point", coordinates: [85.13, 25.61] },
      complianceVerified: true,
    },
    { upsert: true }
  );
  await Ambulance.findOneAndUpdate(
  { vehicleNumber: "DL01-DE-9999" },
  {
    vehicleNumber: "DL01-DE-9999",
    operator: operator._id,
    tier: "ALS",
    equipment: ["oxygen", "defibrillator", "ventilator"],
    crew: [{ name: "A. Singh", role: "EMT", certified: true }],
    status: "idle",
    location: {
      type: "Point",
      coordinates: [77.10, 28.75],
    },
    complianceVerified: true,
  },
  { upsert: true }
);

  await Ambulance.findOneAndUpdate(
    { vehicleNumber: "BR01-CD-5678" },
    {
      vehicleNumber: "BR01-CD-5678",
      operator: operator._id,
      tier: "BLS",
      equipment: ["oxygen", "trauma kit"],
      crew: [{ name: "S. Devi", role: "Driver-EMT", certified: true }],
      status: "idle",
      location: { type: "Point", coordinates: [85.145, 25.605] },
      complianceVerified: true,
    },
    { upsert: true }
  );

  await CoverageZone.findOneAndUpdate(
    { name: "Patna Metro" },
    { name: "Patna Metro", center: { type: "Point", coordinates: [85.1376, 25.5941] }, radiusKm: 15, status: "live" },
    { upsert: true }
  );
  await CoverageZone.findOneAndUpdate(
  { name: "Delhi NCR Demo" },
  {
    name: "Delhi NCR Demo",
    center: {
      type: "Point",
      coordinates: [77.10, 28.75],
    },
    radiusKm: 25,
    status: "live",
  },
  { upsert: true }
);

  await CoverageZone.findOneAndUpdate(
    { name: "Muzaffarpur" },
    { name: "Muzaffarpur", center: { type: "Point", coordinates: [85.39, 26.12] }, radiusKm: 10, status: "onboarding" },
    { upsert: true }
  );

  await CoverageZone.findOneAndUpdate(
    { name: "Gaya" },
    { name: "Gaya", center: { type: "Point", coordinates: [85.0, 24.79] }, radiusKm: 10, status: "coming_soon" },
    { upsert: true }
  );

  console.log("[seed] Done. Operator:", operator._id, "Hospital:", hospital._id);
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
