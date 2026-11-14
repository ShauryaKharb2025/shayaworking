import { useCaseResource } from "../components/CaseWorkflow";
import { useEffect, useState } from "react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import StatusPill from "../components/StatusPill";

function VehicleRecord({ ambulance, onSaved }) {
  const [opened, setOpened] = useState(false);
  const [editing, setEditing] = useState(false);
  const [equipment, setEquipment] = useState(ambulance.equipment.join(", "));
  const [crew, setCrew] = useState(ambulance.crew.map(row => row.name + " / " + row.role).join("\n"));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const resource = useCaseResource(opened ? `/ambulances/${ambulance._id}/operations` : null, 8000);
  async function update(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const rows = crew.split("\n").map(row => row.trim()).filter(Boolean);
      const members = rows.map(row => {
        const [name, role] = row.split("/").map(value => value.trim());
        if (!name || !role) throw new Error("Enter each crew member as Name / Qualification.");
        return { name, role };
      });
      const { data } = await api.patch("/ambulances/" + ambulance._id, {
        equipment: equipment.split(",").map(value => value.trim()).filter(Boolean), crew: members,
      });
      onSaved(data.ambulance);
      setEditing(false);
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Could not update vehicle records.");
    } finally {
      setSaving(false);
    }
  }
  return <div className="mt-3 space-y-2">
    <button type="button" onClick={() => setOpened(!opened)}>{opened ? "Hide operations" : "View operations"}</button>
    {["idle", "offline"].includes(ambulance.status) && <button type="button" onClick={() => setEditing(!editing)}>
      {editing ? "Close equipment and crew" : "Edit equipment and crew"}
    </button>}
    {(resource.error || error) && <p role="alert">{resource.error || error}</p>}
    {editing && <form onSubmit={update} className="grid gap-2">
      <label>Equipment <input value={equipment} onChange={event => setEquipment(event.target.value)} /></label>
      <label>Crew, one Name / Qualification per line <textarea value={crew} onChange={event => setCrew(event.target.value)} /></label>
      <p>Changes require renewed compliance verification.</p>
      <button disabled={saving}>Save vehicle records</button>
    </form>}
    {opened && !resource.data && !resource.error && <p role="status">Loading operations…</p>}
    {opened && resource.data?.trips.length === 0 && <p>No trip assignments recorded.</p>}
    {opened && resource.data?.trips.map(trip => <div key={trip.id}>
      <p>Case {trip.id} · {trip.status.replaceAll("_", " ")}</p>
      <ul>{trip.events.map((event, index) => <li key={index}>{event.type} · {new Date(event.at).toLocaleString()}</li>)}</ul>
    </div>)}
  </div>;
}

export default function OperatorDashboard() {
  const { user } = useAuth();

  const [ambulances, setAmbulances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [form, setForm] = useState({
    vehicleNumber: "",
    tier: "BLS",
    equipment: "",
    driverName: "",
    paramedicName: "",
  });

  const loadAmbulances = async () => {
    try {
      setLoading(true);

      const params = user?.operator
        ? { operatorId: user.operator }
        : {};

      const { data } = await api.get("/ambulances", { params });

      setAmbulances(data.ambulances || []);
    } catch (err) {
      console.error(err);
      setMessage(
        err.response?.data?.message || "Could not load ambulances."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAmbulances();
  }, [user?.operator]);

  const updateForm = (field, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!user?.operator) {
      setMessage(
        "Your operator account is not linked to an operator yet."
      );
      return;
    }

    if (!form.vehicleNumber.trim()) {
      setMessage("Enter the ambulance vehicle number.");
      return;
    }

    try {
      setSaving(true);
      setMessage("");

      const crew = [
        form.driverName.trim()
          ? {
              name: form.driverName.trim(),
              role: "Driver",
              certified: false,
            }
          : null,

        form.paramedicName.trim()
          ? {
              name: form.paramedicName.trim(),
              role: "Paramedic",
              certified: false,
            }
          : null,
      ].filter(Boolean);

      const equipment = form.equipment
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

      const { data } = await api.post("/ambulances", {
        vehicleNumber: form.vehicleNumber.trim().toUpperCase(),
        operatorId: user.operator,
        tier: form.tier,
        equipment,
        crew,
      });

      setAmbulances((prev) => [data.ambulance, ...prev]);

      setForm({
        vehicleNumber: "",
        tier: "BLS",
        equipment: "",
        driverName: "",
        paramedicName: "",
          });

      setMessage("Ambulance successfully onboarded.");
    } catch (err) {
      console.error(err);

      setMessage(
        err.response?.data?.message ||
          "Could not onboard ambulance."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <div className="mb-10">
        <p className="text-sm font-medium text-signal-dark">
          Operator Portal
        </p>

        <h1 className="mt-2 font-display text-4xl font-semibold text-navy">
          Ambulance fleet onboarding
        </h1>

        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink/60">
          Register ambulances, capture their equipment and crew details,
          and make verified fleet capacity available to Sahay dispatch.
        </p>
      </div>

      {!user?.operator && (
        <div className="mb-8 rounded-xl border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-800">
          Your operator account is not linked to an Operator record yet.
          Link the user to an Operator in MongoDB/Atlas before onboarding
          ambulances.
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[420px_1fr]">
        {/* ONBOARD FORM */}
        <section className="rounded-2xl border border-line bg-white p-6 shadow-sm">
          <h2 className="font-display text-xl font-semibold text-navy">
            Add ambulance
          </h2>

          <p className="mt-1 text-xs text-ink/50">
            Add a vehicle to your verified fleet.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="text-xs font-medium text-ink/60">
                Vehicle number
              </label>

              <input
                value={form.vehicleNumber}
                onChange={(e) =>
                  updateForm("vehicleNumber", e.target.value)
                }
                placeholder="DL01AB1234"
                className="mt-1 w-full rounded-lg border border-line px-4 py-3 text-sm outline-none focus:border-navy"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-ink/60">
                Ambulance tier
              </label>

              <select
                value={form.tier}
                onChange={(e) =>
                  updateForm("tier", e.target.value)
                }
                className="mt-1 w-full rounded-lg border border-line bg-white px-4 py-3 text-sm outline-none focus:border-navy"
              >
                <option value="BLS">
                  BLS — Basic Life Support
                </option>
                <option value="ALS">
                  ALS — Advanced Life Support
                </option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-ink/60">
                Equipment
              </label>

              <input
                value={form.equipment}
                onChange={(e) =>
                  updateForm("equipment", e.target.value)
                }
                placeholder="Oxygen, AED, Ventilator"
                className="mt-1 w-full rounded-lg border border-line px-4 py-3 text-sm outline-none focus:border-navy"
              />

              <p className="mt-1 text-[11px] text-ink/40">
                Separate equipment with commas.
              </p>
            </div>

            <div>
              <label className="text-xs font-medium text-ink/60">
                Driver name
              </label>

              <input
                value={form.driverName}
                onChange={(e) =>
                  updateForm("driverName", e.target.value)
                }
                placeholder="Driver"
                className="mt-1 w-full rounded-lg border border-line px-4 py-3 text-sm outline-none focus:border-navy"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-ink/60">
                Paramedic name
              </label>

              <input
                value={form.paramedicName}
                onChange={(e) =>
                  updateForm("paramedicName", e.target.value)
                }
                placeholder="Paramedic"
                className="mt-1 w-full rounded-lg border border-line px-4 py-3 text-sm outline-none focus:border-navy"
              />
            </div>



            {message && (
              <div className="rounded-lg bg-paper px-4 py-3 text-sm text-ink/70">
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={saving || !user?.operator}
              className="w-full rounded-full bg-navy px-5 py-3 text-sm font-semibold text-white hover:bg-navy-light disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Onboarding..." : "Onboard ambulance"}
            </button>
          </form>
        </section>

        {/* FLEET */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-display text-xl font-semibold text-navy">
                Your fleet
              </h2>

              <p className="text-xs text-ink/50">
                {ambulances.length} ambulance
                {ambulances.length === 1 ? "" : "s"} registered
              </p>
            </div>

            <button
              onClick={loadAmbulances}
              className="rounded-full border border-line px-4 py-2 text-xs font-medium hover:border-ink/40"
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-line bg-white p-8 text-center text-sm text-ink/50">
              Loading fleet...
            </div>
          ) : ambulances.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line bg-white p-10 text-center">
              <p className="font-medium text-navy">
                No ambulances onboarded yet.
              </p>

              <p className="mt-2 text-sm text-ink/50">
                Add your first ambulance using the form.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {ambulances.map((ambulance) => (
                <div
                  key={ambulance._id}
                  className="rounded-2xl border border-line bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-3">
                        <h3 className="font-display text-lg font-semibold text-navy">
                          {ambulance.vehicleNumber}
                        </h3>

                        <span className="rounded-full bg-navy/5 px-3 py-1 text-xs font-medium text-navy">
                          {ambulance.tier}
                        </span>
                      </div>

                      <p className="mt-1 text-xs text-ink/50">
                        {ambulance.equipment?.length
                          ? ambulance.equipment.join(", ")
                          : "No equipment listed"}
                      </p>
                    </div>

                    <StatusPill status={ambulance.status} />
                    {["idle", "offline"].includes(ambulance.status) && <button type="button" onClick={async () => {
                      try {
                        const status = ambulance.status === "idle" ? "offline" : "idle";
                        const { data } = await api.patch("/ambulances/" + ambulance._id, { status });
                        setAmbulances(rows => rows.map(row => row._id === ambulance._id ? data.ambulance : row));
                      } catch (err) {
                        setMessage(err.response?.data?.message || "Could not update availability.");
                      }
                    }}>{ambulance.status === "idle" ? "Take offline" : "Mark available"}</button>}
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg bg-paper p-3">
                      <p className="text-[11px] uppercase tracking-wide text-ink/40">
                        Crew
                      </p>

                      <p className="mt-1 text-sm text-ink">
                        {ambulance.crew?.length
                          ? ambulance.crew
                              .map(
                                (member) =>
                                  `${member.name} (${member.role})`
                              )
                              .join(", ")
                          : "No crew assigned"}
                      </p>
                    </div>

                    <div className="rounded-lg bg-paper p-3">
                      <p className="text-[11px] uppercase tracking-wide text-ink/40">
                        Compliance
                      </p>

                      <p className="mt-1 text-sm font-medium">
                        {ambulance.complianceVerified
                          ? "Verified"
                          : "Pending verification"}
                      </p>
                    </div>
                  </div>
                  <VehicleRecord ambulance={ambulance} onSaved={updated =>
                    setAmbulances(rows => rows.map(row => row._id === updated._id ? updated : row))} />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}