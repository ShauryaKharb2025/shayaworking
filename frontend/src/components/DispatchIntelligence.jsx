import { useState } from "react";
import api from "../api/axios";
import { Destinations } from "./CaseWorkflow";

const modules = [
  ["ambulance", "Ambulance selection", "explanation"],
  ["hospital", "Hospital selection", "comparison"],
  ["coordination", "Patient-to-ambulance coordination", "progress"],
  ["journey", "Emergency journey and treatment log", "summary"],
];

function IntelligencePanel({ tripId, module, title, field }) {
  const [result, setResult] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function generate() {
    setPending(true);
    setError("");
    setResult(null);
    try {
      const { data } = await api.post(`/intelligence/trips/${tripId}/${module}`);
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.message || "Could not load case intelligence.");
    } finally {
      setPending(false);
    }
  }
  const rows = result?.input.candidates || result?.input.hospitals || [];
  const output = result?.source === "gemini" ? result.output : null;
  const references = output?.candidateRefs || output?.hospitalRefs || output?.evidenceRefs;
  return <article className="rounded-xl border border-line p-4">
    <h3 className="font-semibold">{title}</h3>
    <button type="button" onClick={generate} disabled={pending} className="mt-2 underline">
      {pending ? "Loading…" : "Generate explanation"}
    </button>
    {error && <p role="alert">{error}</p>}
    {result && <div className="mt-2">
      {output ? <p>Gemini · {output[field]}</p> :
        <p>Gemini {result.reason === "disabled" ? "is disabled" : "is unavailable"}.</p>}
      {references?.length > 0 && <p>References {references.join(", ")}</p>}
      {output?.communicationNeeds?.length > 0 && <ul>{output.communicationNeeds.map((note, index) =>
        <li key={index}>{note}</li>)}</ul>}
      {rows.length > 0 && <ol>{rows.map(row => <li key={row.ref}>
        Candidate {row.ref} · {row.distanceKm} km · {row.eligible ? "Eligible" : row.reasons?.join(", ") || "No available beds"}
      </li>)}</ol>}
      {module === "coordination" && <p>Recorded status {result.input.status.replaceAll("_", " ")}. Simulated ETA {result.input.simulatedEtaMinutes ?? "unavailable"}.</p>}
      {module === "journey" && <ol>{result.input.events.map(event => <li key={event.ref}>
        Event {event.ref} · {event.type} · {new Date(event.at).toLocaleString()}
      </li>)}</ol>}
    </div>}
  </article>;
}

export default function DispatchIntelligence({ trips }) {
  const [selection, setSelection] = useState("");
  const tripId = trips.some(trip => trip._id === selection) ? selection : "";
  return <section className="mt-8 rounded-xl border border-line bg-white p-4">
    <h2 className="font-semibold">Case intelligence</h2>
    <label className="block py-3">Emergency case <select value={tripId} onChange={event => setSelection(event.target.value)} className="border p-2">
      <option value="">Select a case</option>
      {trips.map(trip => <option key={trip._id} value={trip._id}>{trip.patient?.name || trip._id}</option>)}
    </select></label>
    {tripId && <Destinations key={tripId} tripId={tripId} />}
    {tripId && <div className="grid gap-3 md:grid-cols-2">
      {modules.map(([module, title, field]) => <IntelligencePanel key={tripId + module} {...{ tripId, module, title, field }} />)}
    </div>}
  </section>;
}
