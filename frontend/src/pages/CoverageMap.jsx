import { useEffect, useState } from "react";
import api from "../api/axios";
import FleetMap from "../components/FleetMap";
import StatusPill from "../components/StatusPill";

export default function CoverageMap() {
  const [zones, setZones] = useState([]);
  const [loading,setLoading]=useState(true);
  const [form, setForm] = useState({ pincodeOrArea: "", language: "en", contactPreference: "sms", contact: "", consented: false });
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/coverage").then(({ data }) => setZones(data.zones)).catch(()=>setError("Could not load coverage. Please try again later.")).finally(()=>setLoading(false));
  }, []);

  async function submitWaitlist(e) {
    e.preventDefault();
    setError("");
    try {
      await api.post("/coverage/waitlist", form);
      setSent(true);
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't submit — try again.");
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-14">
      <p className="text-sm font-medium text-signal-dark">Coverage promise</p>
      <h1 className="mt-2 font-display text-3xl font-semibold text-navy">Honest about where we're live</h1>
      <p className="mt-3 max-w-prose text-sm leading-relaxed text-ink/60">
        Outside a live zone, we say "request received" — never "ambulance found." Waitlist demand
        prioritises which city we onboard next.
      </p>

      <div className="mt-7"><FleetMap zones={zones}/></div>
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {zones.map((z) => (
          <div key={z._id} className="rounded-xl border border-line bg-white p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-navy">{z.name}</h3>
              <StatusPill status={z.status} />
            </div>
            <p className="mt-2 text-xs text-ink/50">{z.radiusKm} km coverage radius</p>
          </div>
        ))}
        {zones.length === 0 && <p className="text-sm text-ink/40">{loading?"Loading coverage areas…":"No coverage areas available."}</p>}
      </div>

      <div className="mt-14 max-w-md rounded-2xl border border-line bg-white p-6">
        <h2 className="font-display text-lg font-semibold text-navy">Get notified when we launch near you</h2>
        {sent ? (
          <p className="mt-4 text-sm text-verified">Request received — we'll reach out when service goes live in your area.</p>
        ) : (
          <form onSubmit={submitWaitlist} className="mt-4 space-y-4">
            <input
              required
              placeholder="Pincode or area"
              value={form.pincodeOrArea}
              onChange={(e) => setForm({ ...form, pincodeOrArea: e.target.value })}
              className="w-full rounded-lg border border-line px-4 py-2.5 text-sm outline-none focus:border-navy"
            />
            <input
              required
              placeholder="Phone or email"
              value={form.contact}
              onChange={(e) => setForm({ ...form, contact: e.target.value })}
              className="w-full rounded-lg border border-line px-4 py-2.5 text-sm outline-none focus:border-navy"
            />
            <div className="flex gap-3">
              <select
                value={form.language}
                onChange={(e) => setForm({ ...form, language: e.target.value })}
                className="w-1/2 rounded-lg border border-line px-3 py-2.5 text-sm"
              >
                <option value="en">English</option>
                <option value="hi">हिन्दी</option>
                <option value="regional">Regional</option>
              </select>
              <select
                value={form.contactPreference}
                onChange={(e) => setForm({ ...form, contactPreference: e.target.value })}
                className="w-1/2 rounded-lg border border-line px-3 py-2.5 text-sm"
              >
                <option value="sms">SMS</option>
                <option value="ivr">Call (IVR)</option>
                <option value="email">Email</option>
              </select>
            </div>
            <label className="flex items-start gap-2 text-xs text-ink/60">
              <input
                type="checkbox"
                checked={form.consented}
                onChange={(e) => setForm({ ...form, consented: e.target.checked })}
                className="mt-0.5 accent-navy"
              />
              I consent to be notified when service is live in my area.
            </label>
            {error && <p className="text-sm text-signal-dark">{error}</p>}
            <button className="w-full rounded-full bg-navy py-3 text-sm font-semibold text-white hover:bg-navy-light">
              Get notified
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
