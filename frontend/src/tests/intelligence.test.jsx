// @vitest-environment jsdom

import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import DispatchIntelligence from "../components/DispatchIntelligence";
import api from "../api/axios";

vi.mock("../api/axios", () => ({ default: { post: vi.fn() } }));
vi.mock("../components/CaseWorkflow", () => ({ Destinations: () => null }));

test("renders each module's API result and replaces it with the fallback on failure", async () => {
  const responses = {
    ambulance: { input: { candidates: [] }, output: { explanation: "Ambulance response", candidateRefs: ["1"] } },
    hospital: { input: { hospitals: [] }, output: { comparison: "Hospital response", hospitalRefs: ["2"] } },
    coordination: {
      input: { status: "en_route", simulatedEtaMinutes: 6 },
      output: { progress: "Coordination response", communicationNeeds: ["Update the dispatcher"] },
    },
    journey: { input: { events: [] }, output: { summary: "Journey response", evidenceRefs: ["3"] } },
  };
  api.post.mockImplementation(async path => ({ data: { source: "gemini", ...responses[path.split("/").at(-1)] } }));
  render(<DispatchIntelligence trips={[{ _id: "synthetic-case" }]} />);
  fireEvent.change(screen.getByLabelText("Emergency case"), { target: { value: "synthetic-case" } });

  for (const button of screen.getAllByRole("button", { name: "Generate explanation" })) fireEvent.click(button);
  for (const [name, path] of [
    ["Ambulance response", "ambulance"], ["Hospital response", "hospital"],
    ["Coordination response", "coordination"], ["Journey response", "journey"],
  ]) {
    await screen.findByText("Gemini · " + name);
    expect(api.post).toHaveBeenCalledWith("/intelligence/trips/synthetic-case/" + path);
  }
  expect(screen.getByText("Update the dispatcher")).toBeTruthy();
  expect(screen.getByText("References 3")).toBeTruthy();

  api.post.mockResolvedValueOnce({ data: { source: "deterministic", reason: "unavailable", input: { candidates: [] } } });
  const ambulance = screen.getByRole("heading", { name: "Ambulance selection" }).closest("article");
  fireEvent.click(within(ambulance).getByRole("button", { name: "Generate explanation" }));
  await within(ambulance).findByText("Gemini is unavailable.");
  expect(within(ambulance).queryByText("Gemini · Ambulance response")).toBeNull();
});
