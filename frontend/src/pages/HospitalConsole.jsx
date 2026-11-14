import { useEffect, useState } from "react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { HospitalReferrals } from "../components/CaseWorkflow";
import { connectSocket } from "../api/socket";

export default function HospitalConsole() {
  const { user } = useAuth();
  const [trips, setTrips] = useState([]);

  // Bed availability
  const [ready, setReady] = useState(false);
  const [specialties, setSpecialties] = useState("");
  const [beds, setBeds] = useState(0);
  const [savingBeds, setSavingBeds] = useState(false);
  const [bedMessage, setBedMessage] = useState("");

  const hospitalId = user?.hospital;

  useEffect(() => {
    if (!hospitalId) return;

    function loadIncoming() {
      return api
      .get(`/hospitals/${hospitalId}/incoming`)
      .then(({ data }) => setTrips(data.trips))
      .catch((err) => setBedMessage(err.response?.data?.message || "Could not load incoming cases."));
    }
    loadIncoming();

    // Load current hospital bed availability
    api
      .get("/hospitals")
      .then(({ data }) => {
        const hospital = data.hospitals?.find(
          (h) => h._id === hospitalId
        );

        if (hospital) {
          setBeds(hospital.bedsAvailable ?? 0);
          setReady(hospital.receivingReady);
          setSpecialties(hospital.specialties.join(", "));
        }
      })
      .catch((err) => console.error("Failed to load hospital:", err));

    const socket = connectSocket();

    socket.emit("join:hospital", hospitalId);

    socket.on("hospital:pre_alert", loadIncoming);
    socket.on("case:refresh", loadIncoming);

    return () => {
      socket.off("hospital:pre_alert", loadIncoming);
      socket.off("case:refresh", loadIncoming);
    };
  }, [hospitalId]);

  const updateBeds = async () => {
    if (!hospitalId) return;

    try {
      setSavingBeds(true);
      setBedMessage("");

      await api.patch(`/hospitals/${hospitalId}/beds`, {
        bedsAvailable: beds,
        receivingReady: ready,
        specialties: specialties.split(",").map(value => value.trim()).filter(Boolean),
      });

      setBedMessage("Bed availability updated successfully.");
    } catch (err) {
      console.error("Failed to update beds:", err);

      setBedMessage(
        err?.response?.data?.message ||
          "Failed to update bed availability."
      );
    } finally {
      setSavingBeds(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <p className="text-sm font-medium text-signal-dark">ER console</p>

      <h1 className="mt-2 font-display text-3xl font-semibold text-navy">
        Incoming, pre-alerted
      </h1>

      <p className="mt-2 text-sm text-ink/60">
        Vitals, ETA and specialty need arrive before the ambulance does.
      </p>

      {hospitalId && <>
        <HospitalReferrals />
        <label className="block"><input type="checkbox" checked={ready} onChange={event => setReady(event.target.checked)} /> Receiving team ready</label>
        <label className="block">Specialties <input value={specialties} onChange={event => setSpecialties(event.target.value)} /></label>
      </>}
      {!hospitalId && (
        <p className="mt-6 rounded-lg bg-amber/10 px-4 py-3 text-sm text-amber">
          Your account isn't linked to a hospital yet — an admin needs to set{" "}
          <code>user.hospital</code>.
        </p>
      )}

      {/* Hospital bed availability */}
      {hospitalId && (
        <div className="mt-8 rounded-xl border border-line bg-white p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-ink/50">
                ER bed availability
              </p>

              <p className="mt-1 text-3xl font-semibold text-navy">
                {beds}
              </p>

              <p className="mt-1 text-xs text-ink/40">
                Currently available emergency beds
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setBeds((prev) => Math.max(0, prev - 1))}
                disabled={savingBeds}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-line text-xl text-navy hover:bg-paper disabled:opacity-50"
              >
                −
              </button>

              <span className="min-w-12 text-center text-lg font-semibold text-navy">
                {beds}
              </span>

              <button
                type="button"
                onClick={() => setBeds((prev) => prev + 1)}
                disabled={savingBeds}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-line text-xl text-navy hover:bg-paper disabled:opacity-50"
              >
                +
              </button>

              <button
                type="button"
                onClick={updateBeds}
                disabled={savingBeds}
                className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingBeds ? "Updating..." : "Update"}
              </button>
            </div>
          </div>

          {bedMessage && (
            <p className="mt-3 text-sm text-ink/60">
              {bedMessage}
            </p>
          )}
        </div>
      )}

      {/* Existing incoming trips */}
      <div className="mt-8 space-y-4">
        {trips.length === 0 && hospitalId && (
          <p className="text-sm text-ink/40">
            No incoming patients right now.
          </p>
        )}

        {trips.map((t) => (
          <div
            key={t._id}
            className="rounded-xl border border-line bg-white p-5"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-navy">
                {t.patient?.name || "Unknown patient"}
              </h3>

              <span className="text-sm font-medium text-signal-dark">
                {t.etaMinutes
                  ? `${t.etaMinutes} min ETA`
                  : "ETA pending"}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-ink/40">Urgency</p>
                <p className="capitalize text-navy">
                  {t.triage?.urgencyTier || "—"}
                </p>
              </div>

              <div>
                <p className="text-ink/40">Ambulance</p>
                <p className="text-navy">
                  {t.ambulance?.vehicleNumber || "—"}
                </p>
              </div>

              <div>
                <p className="text-ink/40">Equipment on board</p>
                <p className="text-navy">
                  {(t.triage?.suggestedEquipment || []).join(", ") || "—"}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}