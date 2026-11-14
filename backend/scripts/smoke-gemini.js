const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const { explain } = require("../src/services/geminiIntelligence");

const synthetic = {
  ambulanceDecision: { candidates: [{ id: "vehicle-1", tier: "ALS", simulatedPickupMinutes: 4 }, { id: "vehicle-2", tier: "ALS", simulatedPickupMinutes: 7 }],
    reasonCodes: ["pickup_eta", "gps_freshness", "capability"] },
  hospitalDecision: { candidates: [{ id: "hospital-1", bedsAvailable: 2, simulatedTravelMinutes: 8 }, { id: "hospital-2", bedsAvailable: 4, simulatedTravelMinutes: 10 }],
    reasonCodes: ["travel_eta", "capacity", "specialty"] },
  coordinationDecision: { status: "en_route", simulatedEtaMinutes: 6, allowedActions: ["monitor_pickup", "review_pickup_eta"] },
  journeyDigest: { events: [{ id: "event-1", type: "sos:received", at: "2026-01-01T10:00:00Z" },
    { id: "event-2", type: "status:dispatched", at: "2026-01-01T10:05:00Z" }] },
};

async function main() {
  if (!process.env.GEMINI_API_KEY?.trim()) {
    console.error("Gemini smoke skipped: GEMINI_API_KEY is missing from the backend environment.");
    process.exitCode = 1;
    return;
  }
  await Promise.all(Object.entries(synthetic).map(async ([module, input]) => {
    const started = performance.now();
    const result = await explain(module, input);
    console.log(module + ": " + (result.source === "gemini" ? "validated Gemini response" : "fallback") + " (" + Math.round(performance.now() - started) + " ms)");
    if (result.source !== "gemini") process.exitCode = 1;
  }));
}

main().catch(() => {
  console.error("Gemini smoke failed.");
  process.exitCode = 1;
});
