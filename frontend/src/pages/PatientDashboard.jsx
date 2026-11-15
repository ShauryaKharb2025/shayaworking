import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";

const STATUS_LABEL = {
  requested: "Finding an ambulance",
  offered: "Connecting with nearest ambulance",
  matched: "Ambulance matched",
  dispatched: "Ambulance dispatched",
  en_route: "Ambulance is on the way",
  arrived_pickup: "Ambulance has arrived",
  en_route_hospital: "En route to hospital",
  cancelled: "Request cancelled",
};

const ACTIVE_STATUSES = [
  "requested",
  "offered",
  "matched",
  "dispatched",
  "en_route",
  "arrived_pickup",
  "en_route_hospital",
];

export default function PatientDashboard() {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cancellingId, setCancellingId] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function loadTrips() {
      try {
        const { data } = await api.get("/sos");

        if (mounted) {
          setTrips(data.trips || []);
        }
      } catch (err) {
        if (mounted) {
          setError(
            err.response?.data?.message ||
              "Couldn't load your trips."
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadTrips();

    return () => {
      mounted = false;
    };
  }, []);

  const activeTrips = trips.filter((trip) =>
    ACTIVE_STATUSES.includes(trip.status)
  );

  const pastTrips = trips.filter(
    (trip) => !ACTIVE_STATUSES.includes(trip.status)
  );

  async function handleCancelTrip(tripId) {
    if (!window.confirm("Are you sure you want to cancel this ambulance request?")) return;
    try {
      setCancellingId(tripId);
      setError("");
      await api.patch(`/dispatch/trip/${tripId}/status`, { status: "cancelled" });
      setTrips((prev) =>
        prev.map((t) => (t._id === tripId ? { ...t, status: "cancelled" } : t))
      );
    } catch (err) {
      setError(
        err.response?.data?.message || "Could not cancel ambulance request."
      );
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-signal-dark">
            Patient dashboard
          </p>

          <h1 className="mt-2 font-display text-3xl font-semibold text-navy">
            Your emergency trips
          </h1>

          <p className="mt-2 text-sm text-ink/60">
            Track an active ambulance and stay connected during your trip.
          </p>
        </div>

        <Link
          to="/sos"
          className="rounded-full bg-signal px-5 py-3 text-sm font-semibold text-white shadow-sm shadow-signal/30 hover:bg-signal-dark"
        >
          🚨 Request ambulance
        </Link>
      </div>

      {error && (
        <div className="mt-6 rounded-xl bg-signal/10 px-4 py-3 text-sm text-signal-dark">
          {error}
        </div>
      )}

      {loading ? (
        <p className="mt-10 text-sm text-ink/50">
          Loading your trips…
        </p>
      ) : (
        <>
          {/* ACTIVE TRIPS */}
          <section className="mt-10">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-semibold text-navy">
                Active trips
              </h2>

              {activeTrips.length > 0 && (
                <span className="rounded-full bg-verified/10 px-3 py-1 text-xs font-medium text-verified">
                  {activeTrips.length} active
                </span>
              )}
            </div>

            {activeTrips.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-line bg-white p-8 text-center">
                <p className="text-sm text-ink/50">
                  No active ambulance trip right now.
                </p>

                <Link
                  to="/sos"
                  className="mt-4 inline-block text-sm font-medium text-signal-dark underline underline-offset-4"
                >
                  Request an ambulance
                </Link>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {activeTrips.map((trip) => (
                  <div
                    key={trip._id}
                    className="rounded-2xl border border-line bg-white p-6 shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-signal-dark">
                          Live emergency trip
                        </p>

                        <h3 className="mt-1 font-display text-xl font-semibold text-navy">
                          {STATUS_LABEL[trip.status] || trip.status}
                        </h3>
                      </div>

                      <span className="rounded-full bg-navy/5 px-3 py-1.5 text-xs font-medium capitalize text-navy">
                        {trip.status.replace(/_/g, " ")}
                      </span>
                    </div>

                    <div className="mt-6 grid gap-4 sm:grid-cols-3">
                      <div className="rounded-xl bg-paper p-4">
                        <p className="text-xs text-ink/50">
                          Ambulance
                        </p>
                        <p className="mt-1 font-semibold text-navy">
                          {trip.ambulance?.vehicleNumber || "Matching…"}
                        </p>
                      </div>

                      <div className="rounded-xl bg-paper p-4">
                        <p className="text-xs text-ink/50">
                          Tier
                        </p>
                        <p className="mt-1 font-semibold text-navy">
                          {trip.ambulance?.tier ||
                            trip.triage?.suggestedAmbulanceTier ||
                            "—"}
                        </p>
                      </div>

                      <div className="rounded-xl bg-paper p-4">
                        <p className="text-xs text-ink/50">
                          ETA
                        </p>
                        <p className="mt-1 font-semibold text-navy">
                          {trip.etaMinutes
                            ? `${trip.etaMinutes} min`
                            : "Updating…"}
                        </p>
                      </div>
                    </div>

                    <div className="mt-6 flex flex-wrap gap-3">
                      <Link
                        to={`/trip/${trip._id}`}
                        className="flex-1 min-w-[180px] flex items-center justify-center rounded-full bg-navy py-3.5 text-sm font-semibold text-white hover:bg-navy/90"
                      >
                        🚑 Live Tracking
                      </Link>

                      {[
                        "requested",
                        "offered",
                        "matched",
                        "dispatched",
                        "en_route",
                        "arrived_pickup",
                      ].includes(trip.status) && (
                        <button
                          type="button"
                          onClick={() => handleCancelTrip(trip._id)}
                          disabled={cancellingId === trip._id}
                          className="rounded-full border border-red-300 bg-red-50 px-5 py-3.5 text-sm font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-50"
                        >
                          {cancellingId === trip._id
                            ? "Cancelling…"
                            : "✕ Cancel Request"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* PAST TRIPS */}
          <section className="mt-12">
            <h2 className="font-display text-xl font-semibold text-navy">
              Previous trips
            </h2>

            {pastTrips.length === 0 ? (
              <p className="mt-4 text-sm text-ink/40">
                No previous trips.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {pastTrips.map((trip) => (
                  <div
                    key={trip._id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white p-4"
                  >
                    <div>
                      <p className="text-sm font-medium capitalize text-navy">
                        {trip.status.replace(/_/g, " ")}
                      </p>

                      <p className="mt-1 text-xs text-ink/50">
                        {trip.ambulance?.vehicleNumber || "No ambulance"}
                      </p>
                    </div>

                    <Link
                      to={`/trip/${trip._id}`}
                      className="text-sm font-medium text-signal-dark underline underline-offset-4"
                    >
                      View trip
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}