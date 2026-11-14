const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const { explain } = require("../src/services/geminiIntelligence");

const synthetic = {
  ambulance: {
    candidates: [
      { ref: "1", tier: "ALS", eligible: true, reasons: [], distanceKm: 3 },
      { ref: "2", tier: "BLS", eligible: false, reasons: ["ALS required"], distanceKm: 1 },
    ],
  },
  hospital: {
    hospitals: [
      { ref: "1", eligible: true, bedsAvailable: 2, distanceKm: 5 },
      { ref: "2", eligible: false, bedsAvailable: 0, distanceKm: 3 },
    ],
  },
  coordination: {
    status: "en_route", simulatedEtaMinutes: 6, hasConfirmedDestination: false,
  },
  journey: {
    events: [
      { ref: "1", type: "status:en_route", at: "2026-01-01T10:00:00Z" },
      { ref: "2", type: "vitals", at: "2026-01-01T10:05:00Z" },
    ],
  },
};

async function main() {
  if (!process.env.GEMINI_API_KEY?.trim()) {
    console.error("Gemini smoke skipped: GEMINI_API_KEY is missing from the backend environment.");
    process.exitCode = 1;
    return;
  }
  await Promise.all(Object.entries(synthetic).map(async ([module, input]) => {
    const result = await explain(module, input);
    console.log(module + ": " + (result.source === "gemini" ? "validated Gemini response" : "Gemini unavailable"));
    if (result.source !== "gemini") process.exitCode = 1;
  }));
}

main().catch(() => {
  console.error("Gemini smoke failed.");
  process.exitCode = 1;
});
