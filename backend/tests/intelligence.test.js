const { test } = require("node:test");
const assert = require("node:assert/strict");
const { explain } = require("../src/services/geminiIntelligence");

const scenarios = [
  ["ambulance", { candidates: [{ ref: "1", eligible: true }, { ref: "2", eligible: false }] },
    { explanation: "Candidate 1 is eligible.", candidateRefs: ["1"] },
    { explanation: "Candidate 2 is eligible.", candidateRefs: ["2"] }],
  ["hospital", { hospitals: [{ ref: "1", eligible: true }] },
    { comparison: "Candidate 1 has capacity.", hospitalRefs: ["1"] },
    { comparison: "Candidate 2 has capacity.", hospitalRefs: ["2"] }],
  ["coordination", { status: "requested" },
    { progress: "Case requested.", communicationNeeds: [] },
    { progress: "Case requested.", communicationNeeds: [12] }],
  ["journey", { events: [{ ref: "recorded", type: "vitals" }] },
    { summary: "Vitals recorded.", evidenceRefs: ["recorded"] },
    { summary: "Vitals recorded.", evidenceRefs: ["invented"] }],
];

for (const [module, input, valid, invalid] of scenarios) {
  test(module + " accepts only validated output and falls back on timeout", async () => {
    const accepted = await explain(module, input, async request => {
      assert.equal(request.config.httpOptions.retryOptions.attempts, 1);
      assert.equal(request.config.responseMimeType, "application/json");
      assert.equal(request.contents, JSON.stringify(input));
      return JSON.stringify(valid);
    });
    assert.deepEqual(accepted, { source: "gemini", output: valid });
    for (const generate of [async () => JSON.stringify(invalid), async () => "{", () => new Promise(() => {})]) {
      assert.deepEqual(await explain(module, input, generate, 10), { source: "deterministic", reason: "unavailable" });
    }
  });
}

test("model summaries with recorded evidence must cite it", async () => {
  const input = { events: [{ ref: "recorded", type: "vitals" }] };
  const generate = async () => JSON.stringify({ summary: "Vitals recorded.", evidenceRefs: [] });
  assert.deepEqual(await explain("journey", input, generate), { source: "deterministic", reason: "unavailable" });
});
