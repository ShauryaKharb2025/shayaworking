import CaseCarePanel from "../components/CaseCarePanel";
import { useEffect, useRef, useState } from "react";
import api from "../api/axios";
import { ClinicalObservations, SpecialistBooking } from "../components/CaseWorkflow";
import JourneyMap from "../components/JourneyMap";
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

  socket.on("case:refresh", loadDriverData);
  socket.on("trip:assigned", handleTripAssigned);
  socket.on("trip:matched", handleTripMatched);

  const refreshTimer = setInterval(loadDriverData, 10000);
  socket.on("connect", loadDriverData);
  return () => {
    clearInterval(refreshTimer);
    socket.off("connect", loadDriverData);
    socket.off("case:refresh", loadDriverData);
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
  const join = () => socket.emit("join:trip", trip._id);
  const locationUpdate = event => {
    if (event?.tripId !== trip._id) return;
    setAmbulance(current => current ? {...current, location:{type:"Point",coordinates:[event.lng,event.lat]},lastPingAt:new Date().toISOString()} : current);
  };
  join();
  socket.on("connect",join);
  socket.on("trip:location",locationUpdate);
  return () => { socket.off("connect",join);socket.off("trip:location",locationUpdate);socket.emit("leave:trip",trip._id); };
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
    status, simulate = import.meta.env.DEV
  ) {
    if (!trip) {
      return;
    }

    try {
      setUpdatingStatus(true);
      setError("");

      if (status === "dispatched" && simulate && import.meta.env.DEV) {
        stopGPS();
        await api.post(`/dispatch/trip/${trip._id}/demo-drive`);
        await loadDriverData();
        return;
      }
      if (status === "en_route_hospital" && import.meta.env.DEV) {
        stopGPS();
        await api.post(`/dispatch/trip/${trip._id}/demo-drive`, {destination:"hospital"});
        await loadDriverData();
        return;
      }
      const { data } =
        await api.patch(
          `/dispatch/trip/${trip._id}/status`,
          {
            status,
          }
        );

      setTrip(data.trip);
      if (status === "dispatched" && watchId.current === null) startGPS();

      /*
       * After handoff, ambulance becomes idle.
       */
      if (status === "rejected") {
        await loadDriverData();
      }
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
    if (import.meta.env.DEV) {
      if (trip && ["offered","dispatched","en_route"].includes(trip.status) && !trip.events?.some(event=>event.type==="journey:demo_drive_started")) {
        updateTripStatus("dispatched", true);
      }
      return;
    }
    if (["en_route","en_route_hospital"].includes(trip?.status) && trip.events?.some(event=>event.type.startsWith("journey:demo_"))) {
      setError("The simulated drive supplies shared positions until arrival at pickup.");
      return;
    }
    if (watchId.current !== null) return;
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
          if (position.coords.accuracy > 100) { setError("GPS accuracy is low. Move to an open area for precise tracking."); return; }
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

              }
            );

            setAmbulance((prev) =>
              prev
                ? {
                    ...prev,
                    location: { type: "Point", coordinates: [lng, lat] },
                    lastPingAt: new Date().toISOString(),
                  }
                : prev
            );
          } catch (err) {
            setError(err.response?.data?.message || "GPS update could not be sent. Check your connection.");
          }
        },
        (err) => {
          console.error(
            "[driver] GPS error:",
            err
          );

          setError(
            "Pickup accepted, but GPS permission or a precise position is unavailable. Allow location access and use Start GPS to retry."
          );
          if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
          watchId.current = null;
          setGpsActive(false);
        },
        {
          enableHighAccuracy: true,
          maximumAge: 0,
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
    <div className="sahay-role-workspace sahay-driver-workspace">
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

      <div className="sahay-driver-layout">
      {ambulance && (
        <div className="sahay-driver-vehicle rounded-xl border border-line bg-white p-6">
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
                {trip ? "Journey status" : "Ambulance status"}
              </p>

              <p className="mt-1 font-medium capitalize text-navy">
                {(trip?.status || ambulance.status)?.replaceAll("_"," ")}
              </p>
            </div>

            <div className="rounded-lg bg-paper p-4">
              <p className="text-xs text-ink/40">
                GPS status
              </p>

              <p className="mt-1 font-medium text-navy">
                {import.meta.env.DEV
                  ? ["en_route","en_route_hospital"].includes(trip?.status) && trip.events?.some(event=>event.type.startsWith("journey:demo_")) ? "Mock GPS active" : ["arrived_pickup","arrived_hospital"].includes(trip?.status) ? "Arrival recorded" : "Mock GPS ready"
                  : gpsActive ? "🟢 Active" : "⚪ Off"}
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
            {import.meta.env.DEV ? (
              <div className="rounded-lg bg-paper p-4" role="status">
                {trip && ["offered","dispatched","en_route"].includes(trip.status) && !trip.events?.some(event=>event.type==="journey:demo_drive_started") ? <>
                  <p className="font-semibold text-navy">A ride has been allotted to your ambulance.</p>
                  <p>Continue to the marked pickup. Mock GPS starts nearby and is shared with the patient.</p>
                  <button disabled={updatingStatus} onClick={()=>updateTripStatus("dispatched",true)} className="mt-3 rounded-lg bg-navy px-5 py-3 text-white">Continue to pickup · mock GPS</button>
                </> : <p>{trip?.status === "en_route_hospital" ? "Travelling to the allotted hospital with shared mock GPS." : trip?.status === "arrived_hospital" ? "Arrived at the allotted hospital. Awaiting hospital handoff." : trip?.status === "picked_up" ? "Patient pickup confirmed. Start the route to the allotted hospital below." : trip?.status === "en_route" ? "Travelling to the marked pickup with shared mock GPS." : trip?.status === "arrived_pickup" ? "You have reached the marked pickup. Confirm patient pickup below." : "Mock GPS is ready. Your next allotted ride will appear here."}</p>}
              </div>
            ) : !gpsActive ? <button onClick={startGPS} className="rounded-lg bg-navy px-5 py-3 text-white">Start GPS</button>
              : <button onClick={stopGPS} className="rounded-lg border border-line px-5 py-3">Stop GPS</button>}
          </div>
        </div>
      )}

      {!ambulance && (
        <div className="mt-8 rounded-xl border border-line bg-white p-6">
          <p className="font-medium text-navy">
            No ambulance assigned yet.
          </p>

          <p className="mt-1 text-sm text-ink/50">
            Your fleet operator must link your account to an ambulance before automatic pickup offers can reach you.
          </p>
        </div>
      )}

      {/* ==========================
          ACTIVE TRIP
      ========================== */}

      {trip && (
        <div className="sahay-driver-case rounded-xl border border-line bg-white p-6">
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

          {trip.status === "offered" && <p role="status">A ride has been allotted to your ambulance. Review the patient and pickup details, then continue to the marked pickup.</p>}
          {trip.triage?.suggestedEquipment?.length > 0 && <p>Required equipment · {trip.triage.suggestedEquipment.join(", ")}</p>}
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
                {trip.hospital?.name || (trip.proposedHospital?.name ? trip.proposedHospital.name + " · receiving request pending" : "Matching emergency-capable hospital")}
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

          <section className="sahay-trip-actions" aria-label="Trip actions">
            <p className="text-xs uppercase tracking-wide text-ink/40">
              Trip controls
            </p>
            {trip.status==="arrived_hospital" && <p>Arrival is recorded. The hospital receiving team will complete the handoff.</p>}

            <div className="mt-3 flex flex-wrap gap-2">
              {trip.status === "offered" && <>
                {!import.meta.env.DEV && <button disabled={updatingStatus} onClick={() => updateTripStatus("dispatched")}>Accept pickup &amp; enable GPS</button>}

                <button disabled={updatingStatus} onClick={() => updateTripStatus("rejected")}>Reject pickup offer</button>
              </>}
              {trip.status === "arrived_pickup" && <button disabled={updatingStatus} onClick={() => updateTripStatus("picked_up")}>Confirm patient pickup</button>}
              {trip.status === "picked_up" && !trip.hospital && <p>Hospital selected · {trip.proposedHospital?.name || "matching in progress"}. Waiting for the hospital to accept the emergency receiving request.</p>}
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
                "picked_up" && trip.hospital && (
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
                  🏥 Start route to allotted hospital
                </button>
              )}

              {trip.status ===
                "en_route_hospital" && (
                <button
                  onClick={() =>
                    updateTripStatus(
                      "arrived_hospital"
                    )
                  }
                  disabled={
                    updatingStatus
                  }
                  className="rounded-full bg-navy px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Confirm arrival at hospital
                </button>
              )}
            </div>
          </section>
          <section className="mt-4 rounded-lg bg-paper p-4"><h3>Patient emergency</h3><p>{trip.symptoms?.join(", ") || trip.triage?.notes || "No symptom description recorded"}</p></section>
          <JourneyMap trip={{...trip, ambulance: ambulance || trip.ambulance}} />
          {trip.status!=="offered" && <CaseCarePanel key={trip._id} caseId={trip._id}/>}
          {["picked_up","en_route_hospital","arrived_hospital"].includes(trip.status) && <>
            <details><summary>Record a clinical or treatment update</summary><ClinicalObservations caseId={trip._id}/></details>
            <SpecialistBooking caseId={trip._id}/>
          </>}
          {/* ==========================
              STATUS CONTROLS
          ========================== */}


        </div>
      )}

      {!trip && ambulance && (
        <div className="mt-8 rounded-xl border border-line bg-white p-6">
          <p className="font-medium text-navy">
            No active trip
          </p>

          <p className="mt-1 text-sm text-ink/50">
            Your ambulance is assigned. When
            the engine matches your ambulance to a pickup,
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
    </div>
  );
}