// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { JourneyLog } from "../components/CaseWorkflow";
import api from "../api/axios";

vi.mock("../api/axios", () => ({ default: { get: vi.fn() } }));

test("shows authoritative milestones and an empty treatment state without a generation control", async () => {
  const event = { id: "recorded", type: "sos:received", at: "2026-01-01T00:00:00Z" };
  api.get.mockResolvedValue({ data: { status: "requested", coordination: "finding_ambulance",
    events: [event], highlights: [event], observations: [] } });
  render(<JourneyLog caseId="case-id" />);
  expect(await screen.findByText("Finding an available ambulance")).toBeTruthy();
  expect(screen.getAllByText(/Emergency request received/)).toHaveLength(2);
  expect(screen.getByText("No treatment information has been recorded yet.")).toBeTruthy();
  expect(screen.queryByRole("button")).toBeNull();
});
