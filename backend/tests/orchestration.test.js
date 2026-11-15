const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const db = require("../src/data/prisma");
const { processOrchestration } = require("../src/services/autoDispatchService");
const { explain } = require("../src/services/geminiIntelligence");

after(() => db.$disconnect());

test("automatic worker prioritizes nearest eligible vehicle, expires a reservation, and persists grounded highlights", async () => {
  const tag = randomUUID();
  const driver = await db.user.create({ data: { name: tag, email: tag + "@test.invalid", role: "driver" } });
  const second = await db.user.create({ data: { name: tag, email: tag + "-2@test.invalid", role: "driver" } });
  const fleet = await db.operator.create({ data: { name: tag, type: "ngo", verified: true } });
  const specialty = "synthetic-" + tag;
  const point = { coordinates: [77, 28] };
  const first = await db.ambulance.create({ data: { vehicleNumber: tag, operatorId: fleet.id, driverId: driver.id,
    status: "idle", tier: "ALS", complianceVerified: true, equipment: [specialty], crew: [{ role: "EMT", certified: true }], location: point } });
  const preferred = await db.ambulance.create({ data: { vehicleNumber: tag + "-2", operatorId: fleet.id, driverId: second.id,
    status: "idle", tier: "ALS", complianceVerified: true, equipment: [specialty], crew: [{ role: "EMT", certified: true }],
    location: { coordinates: [77.05, 28] } } });
  const hospital = await db.hospital.create({ data: { name: tag, receivingReady: true, bedsAvailable: 1, specialties: [specialty], location: point } });
  const trip = await db.trip.create({ data: { patientId: driver.id, pickupLocation: point, requestedAmbulanceTier: "ALS",
    triage: { suggestedEquipment: [specialty], requiredSpecialties: [specialty] }, autoDispatchAt: new Date(0),
    events: [{ _id: "sos", type: "sos:received", at: new Date().toISOString() }] } });
  const called = new Set();
  const decide = (module, input) => {
    called.add(module);
    return explain(module, input, async () => JSON.stringify({
      ambulanceDecision: () => {
        const ids = input.candidates.map(row => row.id).reverse();
        return { chosenId: ids[0], rankedIds: ids, reasonCode: "capability" };
      },
      hospitalDecision: () => ({ chosenId: hospital.id, rankedIds: [hospital.id], reasonCode: "specialty" }),
      coordinationDecision: () => ({ action: input.allowedActions.at(-1) }),
      journeyDigest: () => ({ evidenceRefs: [input.events.at(-1).id] }),
    }[module]()));
  };
  const read = () => db.trip.findUnique({ where: { id: trip.id }, include: { referrals: true, journeyProjection: true } });
  try {
    await processOrchestration(null, decide, trip.id);
    const offered = await read();
    assert.equal(offered.status, "offered");
    assert.equal(offered.ambulanceId, first.id);
    assert.equal(offered.hospitalId, null);
    assert.equal(offered.referrals[0].hospitalId, hospital.id);
    assert.equal(offered.referrals[0].status, "proposed");
    assert.equal(offered.journeyProjection.coordination, "monitor_acknowledgement");
    assert.ok(offered.events.some(row => offered.journeyProjection.summary.highlights.includes(row._id)));
    assert.equal(called.size, 2);
    let calls = 0;
    await processOrchestration(null, () => { calls++; }, trip.id);
    assert.equal(calls, 0);
    await db.trip.update({ where: { id: trip.id }, data: { autoDispatchAt: new Date(0) } });
    const fallback = async () => ({ source: "deterministic", reason: "disabled" });
    await processOrchestration(null, fallback, trip.id);
    assert.equal((await read()).status, "requested");
    assert.equal((await db.ambulance.findUnique({ where: { id: first.id } })).status, "idle");
    await processOrchestration(null, fallback, trip.id);
    assert.equal((await read()).ambulanceId, preferred.id);
  } finally {
    await db.hospitalReferral.deleteMany({ where: { tripId: trip.id } });
    await db.trip.delete({ where: { id: trip.id } });
    await db.hospital.delete({ where: { id: hospital.id } });
    await db.ambulance.deleteMany({ where: { operatorId: fleet.id } });
    await db.operator.delete({ where: { id: fleet.id } });
    await db.user.deleteMany({ where: { id: { in: [driver.id, second.id] } } });
  }
});

test("operational decisions reject an unknown ambulance and a forbidden coordination action", async () => {
  const ranking = await explain("ambulanceDecision", { candidates: [{ id: "eligible" }], reasonCodes: ["capability"] },
    async () => JSON.stringify({ chosenId: "unverified", rankedIds: ["eligible"], reasonCode: "capability" }));
  assert.equal(ranking.source, "deterministic");
  const action = await explain("coordinationDecision", { allowedActions: ["monitor_pickup"] },
    async () => JSON.stringify({ action: "confirm_handoff" }));
  assert.equal(action.source, "deterministic");
});
