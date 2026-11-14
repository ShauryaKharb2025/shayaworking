/**
 * Sahay demo-data seeder. Run with: `npm run seed` (from backend/)
 * Seeds:
 * - 1 verified operator (Sewa Ambulance Trust)
 * - 10 active drivers and 10 verified ambulances (ALS and BLS)
 * - 15 specialized receiving hospitals, each uniquely equipped for a specific critical medical condition
 * - Live coverage zones
 */
require("dotenv").config();
const connectDB = require("./config/db");
const Operator = require("./models/Operator");
const Ambulance = require("./models/Ambulance");
const Hospital = require("./models/Hospital");
const CoverageZone = require("./models/CoverageZone");
const User = require("./models/User");

const HOSPITALS = [
  {
    name: "AIIMS Apex Heart Institute",
    address: "Sri Aurobindo Marg, Ansari Nagar, New Delhi",
    coordinates: [77.2090, 28.5672],
    specialties: ["Cardiology / Cath Lab", "cardiology", "Cardiac Care"],
    bedsAvailable: 8,
    erContact: "+91-11-2658-8500",
  },
  {
    name: "National Brain & Stroke Hospital",
    address: "Lajpat Nagar IV, Ring Road, New Delhi",
    coordinates: [77.2410, 28.5750],
    specialties: ["Neurology / Stroke Care", "neurology", "Stroke Care"],
    bedsAvailable: 6,
    erContact: "+91-11-2683-1122",
  },
  {
    name: "Jai Prakash Narayan Apex Trauma Centre",
    address: "Ring Road, Safdarjung Enclave, New Delhi",
    coordinates: [77.1950, 28.5650],
    specialties: ["Level-1 Trauma & Emergency Surgery", "trauma", "Trauma Care"],
    bedsAvailable: 10,
    erContact: "+91-11-2616-5900",
  },
  {
    name: "National Institute of Respiratory & Chest Diseases",
    address: "Mehrauli-Badarpur Road, Saket, New Delhi",
    coordinates: [77.1850, 28.5200],
    specialties: ["Pulmonology / Advanced ICU", "pulmonology", "Respiratory Care"],
    bedsAvailable: 7,
    erContact: "+91-11-2651-7890",
  },
  {
    name: "Safdarjung Specialized Apex Burn Center",
    address: "Safdarjung Hospital Campus, Ring Road, New Delhi",
    coordinates: [77.2060, 28.5700],
    specialties: ["Burn ICU & Reconstructive Surgery", "burn", "Burn Care"],
    bedsAvailable: 5,
    erContact: "+91-11-2616-5060",
  },
  {
    name: "Kalawati Saran Children's & Neonatal Hospital",
    address: "Bangla Sahib Marg, Connaught Place, New Delhi",
    coordinates: [77.2140, 28.6320],
    specialties: ["Pediatrics & Neonatal ICU", "pediatrics", "Pediatric Care"],
    bedsAvailable: 9,
    erContact: "+91-11-2336-3120",
  },
  {
    name: "Kasturba Emergency Maternal & Obstetric Center",
    address: "Daryaganj, Old Delhi",
    coordinates: [77.2300, 28.6530],
    specialties: ["Emergency Obstetrics & High-Risk Delivery", "obstetrics", "Maternal Care"],
    bedsAvailable: 6,
    erContact: "+91-11-2327-4100",
  },
  {
    name: "National Poison Information & Emergency Dialysis Hospital",
    address: "Barakhamba Road, Central Delhi",
    coordinates: [77.2280, 28.6180],
    specialties: ["Toxicology & Dialysis Center", "toxicology", "Poison Care"],
    bedsAvailable: 5,
    erContact: "+91-11-2331-5050",
  },
  {
    name: "Sir Ganga Ram Critical Sepsis & Multi-Organ ICU",
    address: "Sir Ganga Ram Hospital Marg, Rajinder Nagar, New Delhi",
    coordinates: [77.1890, 28.6380],
    specialties: ["Medical ICU & Septic Shock Care", "critical care", "Sepsis Care"],
    bedsAvailable: 8,
    erContact: "+91-11-2575-0000",
  },
  {
    name: "Institute of Kidney Diseases & Emergency Nephrology",
    address: "Greater Kailash I, New Delhi",
    coordinates: [77.2500, 28.5400],
    specialties: ["Nephrology & Emergency Hemodialysis", "nephrology", "Renal Care"],
    bedsAvailable: 6,
    erContact: "+91-11-2923-4567",
  },
  {
    name: "Central Institute of Orthopedics & Joint Trauma",
    address: "Ansari Nagar West, New Delhi",
    coordinates: [77.2110, 28.5680],
    specialties: ["Orthopedics & Spine Trauma", "orthopedics", "Orthopedic Care"],
    bedsAvailable: 12,
    erContact: "+91-11-2659-3333",
  },
  {
    name: "Institute of Liver & Emergency Gastroenterology (ILBS)",
    address: "Sector D1, Vasant Kunj, New Delhi",
    coordinates: [77.1580, 28.5080],
    specialties: ["Gastroenterology & Endoscopic Hemostasis", "gastroenterology", "GI Care"],
    bedsAvailable: 7,
    erContact: "+91-11-4630-0000",
  },
  {
    name: "Institute of Human Behavior & Emergency Neuro-Psychiatry",
    address: "Dilshad Garden, East Delhi",
    coordinates: [77.3090, 28.6750],
    specialties: ["Emergency Psychiatry & Acute Stabilization", "psychiatry", "Psychiatric Care"],
    bedsAvailable: 8,
    erContact: "+91-11-2258-3058",
  },
  {
    name: "Guru Nanak Eye Center & Ocular Emergency Unit",
    address: "Maharaja Ranjit Singh Marg, New Delhi",
    coordinates: [77.2400, 28.6370],
    specialties: ["Ophthalmology & Ocular Trauma", "ophthalmology", "Eye Trauma Care"],
    bedsAvailable: 4,
    erContact: "+91-11-2323-4612",
  },
  {
    name: "Metabolic Crisis Center & Diabetic Emergency Care",
    address: "Hauz Khas, New Delhi",
    coordinates: [77.2180, 28.5450],
    specialties: ["Endocrinology & Metabolic Emergency Care", "endocrinology", "Diabetic Care"],
    bedsAvailable: 7,
    erContact: "+91-11-2656-7890",
  },
];

const AMBULANCES = [
  {
    vehicleNumber: "DL01-ALS-1001",
    tier: "ALS",
    driverName: "Ramesh Kumar",
    driverEmail: "driver.ramesh@sahay.local",
    equipment: ["defibrillator", "ventilator", "ECG", "oxygen", "cardiac monitor", "infusion pump"],
    crew: [{ name: "Ramesh Kumar", role: "Driver-EMT", certified: true }, { name: "Dr. K. Nair", role: "Paramedic", certified: true }],
    coordinates: [77.2150, 28.5700],
  },
  {
    vehicleNumber: "DL01-ALS-1002",
    tier: "ALS",
    driverName: "Suresh Singh",
    driverEmail: "driver.suresh@sahay.local",
    equipment: ["defibrillator", "ventilator", "ECG", "oxygen", "trauma kit", "c-collar", "splint"],
    crew: [{ name: "Suresh Singh", role: "Driver-EMT", certified: true }, { name: "V. Pillai", role: "Paramedic", certified: true }],
    coordinates: [77.2000, 28.5800],
  },
  {
    vehicleNumber: "DL01-ALS-1003",
    tier: "ALS",
    driverName: "Amit Verma",
    driverEmail: "driver.amit@sahay.local",
    equipment: ["ventilator", "oxygen", "suction", "infusion pump", "sterile burn dressing", "IV fluids"],
    crew: [{ name: "Amit Verma", role: "Driver-EMT", certified: true }, { name: "R. Sharma", role: "Paramedic", certified: true }],
    coordinates: [77.1850, 28.6250],
  },
  {
    vehicleNumber: "DL01-ALS-1004",
    tier: "ALS",
    driverName: "Rajesh Yadav",
    driverEmail: "driver.rajesh@sahay.local",
    equipment: ["pediatric intubation kit", "neonatal suction", "ventilator", "oxygen", "suction", "defibrillator"],
    crew: [{ name: "Rajesh Yadav", role: "Driver-EMT", certified: true }, { name: "P. Mehta", role: "Paramedic", certified: true }],
    coordinates: [77.2300, 28.6400],
  },
  {
    vehicleNumber: "DL01-ALS-1005",
    tier: "ALS",
    driverName: "Vikram Sharma",
    driverEmail: "driver.vikram@sahay.local",
    equipment: ["obstetric delivery kit", "neonatal suction", "oxygen", "suction", "IV fluids", "defibrillator"],
    crew: [{ name: "Vikram Sharma", role: "Driver-EMT", certified: true }, { name: "S. Rao", role: "Paramedic", certified: true }],
    coordinates: [77.2450, 28.5900],
  },
  {
    vehicleNumber: "DL01-ALS-1006",
    tier: "ALS",
    driverName: "Deepak Gupta",
    driverEmail: "driver.deepak@sahay.local",
    equipment: ["defibrillator", "ECG", "antidote kit", "suction", "IV fluids", "oxygen"],
    crew: [{ name: "Deepak Gupta", role: "Driver-EMT", certified: true }, { name: "M. Joshi", role: "Paramedic", certified: true }],
    coordinates: [77.2200, 28.6100],
  },
  {
    vehicleNumber: "DL01-ALS-1007",
    tier: "ALS",
    driverName: "Manoj Tiwari",
    driverEmail: "driver.manoj@sahay.local",
    equipment: ["ventilator", "infusion pump", "rapid infusion kit", "vasopressor kit", "oxygen", "IV fluids"],
    crew: [{ name: "Manoj Tiwari", role: "Driver-EMT", certified: true }, { name: "K. Reddy", role: "Paramedic", certified: true }],
    coordinates: [77.1650, 28.5200],
  },
  {
    vehicleNumber: "DL01-BLS-2001",
    tier: "BLS",
    driverName: "Anil Chauhan",
    driverEmail: "driver.anil@sahay.local",
    equipment: ["oxygen", "splint", "traction kit", "c-collar", "trauma kit"],
    crew: [{ name: "Anil Chauhan", role: "Driver-EMT", certified: true }],
    coordinates: [77.2100, 28.5600],
  },
  {
    vehicleNumber: "DL01-BLS-2002",
    tier: "BLS",
    driverName: "Pradeep Jha",
    driverEmail: "driver.pradeep@sahay.local",
    equipment: ["oxygen", "soft physical restraints", "sedation kit", "first aid", "trauma kit"],
    crew: [{ name: "Pradeep Jha", role: "Driver-EMT", certified: true }],
    coordinates: [77.2950, 28.6650],
  },
  {
    vehicleNumber: "DL01-BLS-2003",
    tier: "BLS",
    driverName: "Sanjay Mishra",
    driverEmail: "driver.sanjay@sahay.local",
    equipment: ["oxygen", "eye irrigation kit", "glucometer", "IV dextrose", "first aid", "IV fluids"],
    crew: [{ name: "Sanjay Mishra", role: "Driver-EMT", certified: true }],
    coordinates: [77.2250, 28.5500],
  },
];

async function seed() {
  await connectDB();

  const operator = await Operator.findOneAndUpdate(
    { name: "Sewa Ambulance Trust" },
    { name: "Sewa Ambulance Trust", type: "ngo", verified: true, city: "National Network" },
    { upsert: true, new: true }
  );

  console.log("[seed] Seeding 15 specialized hospitals...");
  const seededHospitals = [];
  for (const h of HOSPITALS) {
    const doc = await Hospital.findOneAndUpdate(
      { name: h.name },
      {
        name: h.name,
        address: h.address,
        location: { type: "Point", coordinates: h.coordinates },
        specialties: h.specialties,
        bedsAvailable: h.bedsAvailable,
        receivingReady: true,
        erContact: h.erContact,
      },
      { upsert: true, new: true }
    );
    seededHospitals.push(doc);
  }

  console.log("[seed] Seeding demo role accounts...");
  await User.findOneAndUpdate(
    { email: "patient@sahay.org" },
    { name: "Aarav Sharma", email: "patient@sahay.org", role: "patient", isActive: true },
    { upsert: true }
  );
  await User.findOneAndUpdate(
    { email: "dispatcher@sahay.org" },
    { name: "Priya Nair", email: "dispatcher@sahay.org", role: "dispatcher", isActive: true },
    { upsert: true }
  );
  await User.findOneAndUpdate(
    { email: "hospital@sahay.org" },
    { name: "Dr. Alok Verma", email: "hospital@sahay.org", role: "hospital", hospital: seededHospitals[0]?._id, isActive: true },
    { upsert: true }
  );
  await User.findOneAndUpdate(
    { email: "operator@sewa-ambulance.org" },
    { name: "Sewa Trust Admin", email: "operator@sewa-ambulance.org", role: "operator", operator: operator._id, isActive: true },
    { upsert: true }
  );
  await User.findOneAndUpdate(
    { email: "clinician@sahay.org" },
    { name: "Dr. Sunita Rao", email: "clinician@sahay.org", role: "clinician", hospital: seededHospitals[0]?._id, isActive: true },
    { upsert: true }
  );
  await User.findOneAndUpdate(
    { email: "caregiver@sahay.org" },
    { name: "Meera Sharma", email: "caregiver@sahay.org", role: "caregiver", isActive: true },
    { upsert: true }
  );

  await User.findOneAndUpdate(
    { email: "driver1@sewa-ambulance.org" },
    { name: "Ramesh Kumar", email: "driver1@sewa-ambulance.org", role: "driver", operator: operator._id, isActive: true },
    { upsert: true }
  );

  const passwordHash = await require("bcryptjs").hash("SahayDemo123!", 12);
  for (const role of ["clinician", "caregiver", "admin"]) {
    await User.findOneAndUpdate(
      { email: role + "@sahay.org" },
      { email: role + "@sahay.org", name: "Demo " + role, role, isActive: true },
      { upsert: true }
    );
  }


  console.log("[seed] Seeding 10 ambulances with dedicated certified drivers...");
  const seededAmbulances = [];
  for (const a of AMBULANCES) {
    const driver = await User.findOneAndUpdate(
      { email: a.driverEmail },
      {
        name: a.driverName,
        email: a.driverEmail,
        role: "driver",
        isActive: true,
        phone: "+91-98765-43210",
        operator: operator._id,
      },
      { upsert: true, new: true }
    );

    const doc = await Ambulance.findOneAndUpdate(
      { vehicleNumber: a.vehicleNumber },
      {
        vehicleNumber: a.vehicleNumber,
        operator: operator._id,
        driver: driver._id,
        tier: a.tier,
        equipment: a.equipment,
        crew: a.crew,
        status: "idle",
        location: { type: "Point", coordinates: a.coordinates },
        complianceVerified: true,
        lastPingAt: new Date(),
      },
      { upsert: true, new: true }
    );
    seededAmbulances.push(doc);
  }

  console.log("[seed] Seeding live coverage zones...");
  await CoverageZone.findOneAndUpdate(
    { name: "Delhi NCR Coverage" },
    {
      name: "Delhi NCR Coverage",
      center: { type: "Point", coordinates: [77.2090, 28.6139] },
      radiusKm: 150,
      status: "live",
    },
    { upsert: true }
  );

  await CoverageZone.findOneAndUpdate(
    { name: "National Rapid Emergency Network" },
    {
      name: "National Rapid Emergency Network",
      center: { type: "Point", coordinates: [78.9629, 20.5937] },
      radiusKm: 3000,
      status: "live",
    },
    { upsert: true }
  );

  console.log(
    `[seed] Successfully seeded ${seededAmbulances.length} ambulances and ${seededHospitals.length} hospitals!`
  );
  for (const email of [
    "patient@sahay.org", "dispatcher@sahay.org", "hospital@sahay.org",
    "operator@sewa-ambulance.org", "driver1@sewa-ambulance.org", "driver.ramesh@sahay.local",
    "clinician@sahay.org", "caregiver@sahay.org", "admin@sahay.org",
  ]) {
    await require("./data/prisma").user.updateMany({ where: { email }, data: { passwordHash } });
  }
  process.exit(0);
}

seed().catch((err) => {
  console.error("[seed] Failed:", err);
  process.exit(1);
});
