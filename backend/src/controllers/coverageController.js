const CoverageZone = require("../models/CoverageZone");
const WaitlistEntry = require("../models/WaitlistEntry");

/** GET /api/coverage - public coverage promise map (Live / Limited / Onboarding / Coming soon) */
async function listZones(req, res) {
  const zones = await CoverageZone.find();
  return res.json({ zones });
}

async function createZone(req, res) {
  const zone = await CoverageZone.create(req.body);
  return res.status(201).json({ zone });
}

async function updateZoneStatus(req, res) {
  const zone = await CoverageZone.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
  return res.json({ zone });
}

/** POST /api/coverage/waitlist - "Get Notified" form, public, no auth required */
async function joinWaitlist(req, res) {
  const { pincodeOrArea, language, contactPreference, contact, consented } = req.body;
  if (!consented) return res.status(400).json({ message: "Consent is required to join the waitlist" });
  const entry = await WaitlistEntry.create({ pincodeOrArea, language, contactPreference, contact, consented });
  return res.status(201).json({ entry, message: "Request received. We'll notify you when service goes live here." });
}

/** GET /api/coverage/heatmap - anonymised demand heatmap, prioritises next onboarding pincode */
async function demandHeatmap(req, res) {
  const rows = await require("../data/prisma").waitlistEntry.groupBy({
    by: ["pincodeOrArea"], _count: { _all: true },
    orderBy: { _count: { pincodeOrArea: "desc" } }, take: 20,
  });
  const heatmap = rows.map(row => ({ _id: row.pincodeOrArea, demand: row._count._all }));
  return res.json({ heatmap });
}

module.exports = { listZones, createZone, updateZoneStatus, joinWaitlist, demandHeatmap };
