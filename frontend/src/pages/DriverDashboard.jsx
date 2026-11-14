import { useEffect, useRef, useState } from "react";
import api from "../api/axios";
import { connectSocket } from "../api/socket";

export default function DriverDashboard() {
  const [ambulance, setAmbulance] = useState(null);
  const [trip, setTrip] = useState(null);

  const [gpsActive, setGpsActive] =
    useState(false);

  const [location, setLocation] =
    useState(null);

  const [error, setError] =
    useState("");

  const [updatingStatus, setUpdatingStatus] =
    useState(false);

  const watchId = useRef(null);
 useEffect(() => {
  loadDriverData();

  const socket = connectSocket();

  // Driver-specific room
  socket.emit("join:driver");

  const handleTripAssigned = (payload) => {
    console.log("[driver] trip assigned:", payload);

    if (payload?.trip) {
      setTrip(payload.trip);

      // Join this emergency trip's room
      if (payload.trip._id) {
        socket.emit("join:trip", payload.trip._id);
      }
    }

    if (payload?.ambulance) {
      setAmbulance(payload.ambulance);
    }
  };

  const handleTripMatched = (payload) => {
    console.log("[driver] trip matched:", payload);

    if (payload?.trip) {
      setTrip(payload.trip);

      // Join this emergency trip's room
      if (payload.trip._id) {
        socket.emit("join:trip", payload.trip._id);
      }
    }

    if (payload?.ambulance) {
      setAmbulance(payload.ambulance);
    }
  };

  socket.on("trip:assigned", handleTripAssigned);
  socket.on("trip:matched", handleTripMatched);

  return () => {
    socket.off("trip:assigned", handleTripAssigned);
    socket.off("trip:matched", handleTripMatched);

    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(
        watchId.current
      );
    }
  };
}, []);
useEffect(() => {
  if (!trip?._id) {
    return;
  }

  const socket = connectSocket();
  socket.emit("join:trip", trip._id);
}, [trip?._id]);


  async function loadDriverData() {
    try {
      setError("");

      const { data } =
        await api.get(
          "/dispatch/driver-trip"
        );

      setAmbulance(
        data.ambulance || null
      );

      setTrip(
        data.trip || null
      );

      /*
       * If there is no active trip but the
       * driver has an assigned ambulance,
       * load it separately.
       */
      if (!data.ambulance) {
        const ambulanceResponse =
          await api.get(
            "/ambulances?mine=true"
          );

        setAmbulance(
          ambulanceResponse.data
            .ambulances?.[0] || null
        );
      }
    } catch (err) {
      console.error(
        "[driver] load error:",
        err
      );

      setError(
        err.response?.data?.message ||
          "Could not load driver portal."
      );
    }
  }

  async function refreshTrip() {
    try {
      const { data } =
        await api.get(
          "/dispatch/driver-trip"
        );

      setAmbulance(
        data.ambulance || null
      );

      setTrip(
        data.trip || null
      );
    } catch (err) {
      console.error(
        "[driver] refresh error:",
        err
      );
    }
  }

  async function updateTripStatus(
    status
  ) {
    if (!trip) {
      return;
    }

    try {
      setUpdatingStatus(true);
      setError("");

      const { data } =
        await api.patch(
          `/dispatch/trip/${trip._id}/status`,
          {
            status,
          }
        );

      setTrip(data.trip);

      /*
       * After handoff, ambulance becomes idle.
       */
      if (status === "handed_off") {
        setAmbulance((prev) =>
          prev
            ? {
                ...prev,
                status: "idle",
              }
            : prev
        );
      }
    } catch (err) {
      console.error(
        "[driver] status error:",
        err
      );

      setError(
        err.response?.data?.message ||
          "Could not update trip status."
      );
    } finally {
      setUpdatingStatus(false);
    }
  }

  function startGPS() {
    if (!ambulance) {
      setError(
        "No ambulance assigned."
      );
      return;
    }

    if (!navigator.geolocation) {
      setError(
        "GPS is not supported by this browser."
      );
      return;
    }

    setError("");

    watchId.current =
      navigator.geolocation.watchPosition(
        async (position) => {
          const lat =
            position.coords.latitude;

          const lng =
            position.coords.longitude;

          const heading =
            position.coords.heading;

          setLocation({
            lat,
            lng,
          });

          try {
            await api.post(
              `/dispatch/ambulance/${ambulance._id}/location`,
              {
                lat,
                lng,
                heading:
                  heading !== null
                    ? heading
                    : undefined,
                status:
                  trip
                    ? "en_route"
                    : ambulance.status,
              }
            );

            setAmbulance((prev) =>
              prev
                ? {
                    ...prev,
                    status:
                      trip
                        ? "en_route"
                        : prev.status,
                  }
                : prev
            );
          } catch (err) {
            console.error(
              "[driver] GPS update failed:",
              err
            );
          }
        },
        (err) => {
          console.error(
            "[driver] GPS error:",
            err
          );

          setError(
            "Unable to get your location. Please allow location access."
          );
        },
        {
          enableHighAccuracy: true,
          maximumAge: 5000,
          timeout: 10000,
        }
      );

    setGpsActive(true);
  }

  function stopGPS() {
    if (
      watchId.current !== null
    ) {
      navigator.geolocation.clearWatch(
        watchId.current
      );

      watchId.current = null;
    }

    setGpsActive(false);
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <p className="text-sm font-medium text-signal-dark">
        Driver console
      </p>

      <h1 className="mt-2 font-display text-3xl font-semibold text-navy">
        Ambulance operations
      </h1>

      <p className="mt-2 text-sm text-ink/60">
        Manage your assigned ambulance,
        active emergency trip and live GPS.
      </p>

      {error && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ==========================
          AMBULANCE
      ========================== */}

      {ambulance && (
        <div className="mt-8 rounded-xl border border-line bg-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-ink/40">
                Assigned ambulance
              </p>

              <h2 className="mt-1 text-2xl font-semibold text-navy">
                🚑 {ambulance.vehicleNumber}
              </h2>
            </div>

            <span className="rounded-full bg-navy/5 px-3 py-1 text-sm font-medium text-navy">
              {ambulance.tier}
            </span>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg bg-paper p-4">
              <p className="text-xs text-ink/40">
                Ambulance status
              </p>

              <p className="mt-1 font-medium capitalize text-navy">
                {ambulance.status?.replace(
                  /_/g,
                  " "
                )}
              </p>
            </div>

            <div className="rounded-lg bg-paper p-4">
              <p className="text-xs text-ink/40">
                GPS status
              </p>

              <p className="mt-1 font-medium text-navy">
                {gpsActive
                  ? "🟢 Active"
                  : "⚪ Off"}
              </p>
            </div>
          </div>

          {location && (
            <div className="mt-4 rounded-lg bg-paper p-4">
              <p className="text-xs text-ink/40">
                Current GPS
              </p>

              <p className="mt-1 text-sm text-navy">
                {location.lat.toFixed(6)},{" "}
                {location.lng.toFixed(6)}
              </p>
            </div>
          )}

          <div className="mt-6">
            {!gpsActive ? (
              <button
                onClick={startGPS}
                className="rounded-lg bg-navy px-5 py-3 text-sm font-medium text-white"
              >
                📍 Start GPS
              </button>
            ) : (
              <button
                onClick={stopGPS}
                className="rounded-lg border border-line px-5 py-3 text-sm font-medium text-navy"
              >
                Stop GPS
              </button>
            )}
          </div>
        </div>
      )}

      {!ambulance && (
        <div className="mt-8 rounded-xl border border-line bg-white p-6">
          <p className="font-medium text-navy">
            No ambulance assigned yet.
          </p>

          <p className="mt-1 text-sm text-ink/50">
            A dispatcher must assign an
            ambulance and driver before
            you can receive an emergency trip.
          </p>
        </div>
      )}

      {/* ==========================
          ACTIVE TRIP
      ========================== */}

      {trip && (
        <div className="mt-8 rounded-xl border border-line bg-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-ink/40">
                Active emergency
              </p>

              <h2 className="mt-1 text-xl font-semibold text-navy">
                Trip #{String(trip._id).slice(-6)}
              </h2>
            </div>

            <span className="rounded-full bg-signal/10 px-3 py-1 text-xs font-semibold capitalize text-navy">
              {trip.status?.replace(
                /_/g,
                " "
              )}
            </span>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg bg-paper p-4">
              <p className="text-xs text-ink/40">
                Patient
              </p>

              <p className="mt-1 font-medium text-navy">
                {trip.patient?.name || "—"}
              </p>

              {trip.patient?.phone && (
                <a
                  href={`tel:${trip.patient.phone}`}
                  className="mt-2 inline-block text-sm font-medium text-signal-dark"
                >
                  📞 {trip.patient.phone}
                </a>
              )}
            </div>

            <div className="rounded-lg bg-paper p-4">
              <p className="text-xs text-ink/40">
                Hospital
              </p>

              <p className="mt-1 font-medium text-navy">
                {trip.hospital?.name ||
                  "Not selected yet"}
              </p>

              {trip.hospital?.address && (
                <p className="mt-1 text-xs text-ink/50">
                  {trip.hospital.address}
                </p>
              )}
            </div>
          </div>

          <div className="mt-4 rounded-lg bg-paper p-4">
            <p className="text-xs text-ink/40">
              Pickup
            </p>

            <p className="mt-1 text-sm text-navy">
              {trip.address ||
                "Pickup location available on map"}
            </p>
          </div>

          {/* ==========================
              STATUS CONTROLS
          ========================== */}

          <div className="mt-6">
            <p className="text-xs uppercase tracking-wide text-ink/40">
              Trip controls
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              {trip.status ===
                "dispatched" && (
                <button
                  onClick={() =>
                    updateTripStatus(
                      "en_route"
                    )
                  }
                  disabled={
                    updatingStatus
                  }
                  className="rounded-full bg-navy px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  🚑 Start trip
                </button>
              )}

              {trip.status ===
                "en_route" && (
                <button
                  onClick={() =>
                    updateTripStatus(
                      "arrived_pickup"
                    )
                  }
                  disabled={
                    updatingStatus
                  }
                  className="rounded-full bg-navy px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  📍 Arrived at pickup
                </button>
              )}

              {trip.status ===
                "arrived_pickup" && (
                <button
                  onClick={() =>
                    updateTripStatus(
                      "en_route_hospital"
                    )
                  }
                  disabled={
                    updatingStatus
                  }
                  className="rounded-full bg-navy px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  🏥 Start hospital journey
                </button>
              )}

              {trip.status ===
                "en_route_hospital" && (
                <button
                  onClick={() =>
                    updateTripStatus(
                      "handed_off"
                    )
                  }
                  disabled={
                    updatingStatus
                  }
                  className="rounded-full bg-navy px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  ✅ Handoff complete
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {!trip && ambulance && (
        <div className="mt-8 rounded-xl border border-line bg-white p-6">
          <p className="font-medium text-navy">
            No active trip
          </p>

          <p className="mt-1 text-sm text-ink/50">
            Your ambulance is assigned. When
            dispatch assigns an emergency,
            the trip will appear here.
          </p>

          <button
            onClick={refreshTrip}
            className="mt-4 rounded-full border border-line px-4 py-2 text-xs font-medium text-navy"
          >
            Refresh
          </button>
        </div>
      )}
    </div>
  );
}