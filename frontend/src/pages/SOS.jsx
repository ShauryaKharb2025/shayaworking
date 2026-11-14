import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import { detectLocation } from "../api/location";

const SYMPTOM_CHIPS = [
  "chest pain", "difficulty breathing", "heavy bleeding", "unconscious",
  "high fever", "fracture", "seizure", "allergic reaction",
];

export default function SOS() {
  const [symptoms, setSymptoms] = useState([]);
  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState(null);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  function toggleSymptom(s) {
    setSymptoms((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  async function locate() {
    setLocating(true);
    setError("");
    try {
      const loc = await detectLocation();
      setCoords({ lat: loc.lat, lng: loc.lng });
      if (loc.address) setAddress(loc.address);
    } catch {
      setError("Couldn't get your location — you can still type an address below.");
    } finally {
      setLocating(false);
    }
  }

  async function sendSOS() {
    if (!coords) {
      setError("Share your location first, or we can't find the nearest ambulance.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const { data } = await api.post("/sos", {
        lng: coords.lng,
        lat: coords.lat,
        address,
        channel: "app",
        symptoms,
      });
      navigate(`/trip/${data.trip._id}`);
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't send the request. Try again, or dial 112.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-14">
      <p className="text-sm font-medium text-signal-dark">Emergency request</p>
      <h1 className="mt-2 font-display text-3xl font-semibold text-navy">Where do you need the ambulance?</h1>
      <p className="mt-3 text-sm text-ink/60">
        If this is life-threatening and you can't wait, dial <strong>112</strong> now as well — we run in parallel, not instead of it.
      </p>

      <div className="mt-8 rounded-2xl border border-line bg-white p-6">
        <button
          onClick={locate}
          disabled={locating}
          className="flex w-full items-center justify-between rounded-xl border border-line px-5 py-4 text-left hover:border-navy/40"
        >
          <span>
            <span className="block text-sm font-medium text-navy">
              {coords ? "Location captured" : "Share my current location"}
            </span>
            <span className="block text-xs text-ink/50">
              {coords ? `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}` : "Needed to find the nearest ambulance"}
            </span>
          </span>
          <span className="text-sm text-signal-dark">{locating ? "Locating…" : coords ? "Update" : "Allow"}</span>
        </button>

        <label className="mt-5 block text-sm font-medium text-navy">
          Landmark or address (optional)
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="e.g. Near Gandhi Maidan gate 3"
            className="mt-2 w-full rounded-lg border border-line px-4 py-3 text-sm outline-none focus:border-navy"
          />
        </label>

        <div className="mt-6">
          <p className="text-sm font-medium text-navy">What's happening? (helps us send the right equipment)</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {SYMPTOM_CHIPS.map((s) => (
              <button
                key={s}
                onClick={() => toggleSymptom(s)}
                className={`rounded-full border px-3.5 py-1.5 text-sm capitalize ${
                  symptoms.includes(s) ? "border-signal bg-signal/10 text-signal-dark" : "border-line text-ink/70"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="mt-5 rounded-lg bg-signal/10 px-4 py-3 text-sm text-signal-dark">{error}</p>}

        <button
          onClick={sendSOS}
          disabled={submitting}
          className="mt-7 w-full rounded-full bg-signal py-4 text-base font-semibold text-white shadow-sm shadow-signal/30 hover:bg-signal-dark disabled:opacity-60"
        >
          {submitting ? "Sending…" : "Send SOS"}
        </button>
      </div>
    </div>
  );
}
