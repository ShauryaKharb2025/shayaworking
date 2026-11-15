import { useEffect, useState } from "react";
import api from "../api/axios";
import { connectSocket } from "../api/socket";
import { DispatchCaseOperations } from "../components/CaseWorkflow";
import GoogleMap from "../components/GoogleMap";

export default function DispatcherDashboard() {
  const [ambulances, setAmbulances] = useState([]);
  const [trips, setTrips] = useState([]);
  const [drivers, setDrivers] = useState([]);

  const [assigningTrip, setAssigningTrip] = useState(null);
  const [selectedAmbulance, setSelectedAmbulance] = useState("");
  const [selectedDriver, setSelectedDriver] = useState("");
  const [assigning, setAssigning] = useState(false);

  const [error, setError] = useState("");

  useEffect(() => {
    loadData();

    const socket = connectSocket();

    socket.emit("join:dispatcher");

    function handleFleetUpdate(payload) {
      if (payload?.ambulances) {
        setAmbulances(payload.ambulances);
      }
    }

    function handleTripUpdate(payload) {
      if (!payload?.trip) return;

      setTrips((prev) => {
        const updatedTrip = payload.trip;

        const exists = prev.some(
          (trip) =>
            String(trip._id) === String(updatedTrip._id)
        );

        if (exists) {
          return prev.map((trip) =>
            String(trip._id) === String(updatedTrip._id)
              ? {
                  ...trip,
                  ...updatedTrip,
                }
              : trip
          );
        }

        return [updatedTrip, ...prev];
      });
    }

    socket.on("fleet:update", handleFleetUpdate);
    socket.on("dispatch:new", handleTripUpdate);
    socket.on("case:refresh", loadData);
    socket.on("trip:assigned", handleTripUpdate);
    socket.on("trip:status", handleTripUpdate);

  const refreshTimer = setInterval(loadData, 10000);
  socket.on("connect", loadData);
    return () => {
    clearInterval(refreshTimer);
    socket.off("connect", loadData);
      socket.off("fleet:update", handleFleetUpdate);
      socket.off("dispatch:new", handleTripUpdate);
      socket.off("case:refresh", loadData);
      socket.off("trip:assigned", handleTripUpdate);
      socket.off("trip:status", handleTripUpdate);
    };
  }, []);

  /*
   * ==========================
   * LOAD DASHBOARD DATA
   * ==========================
   */

  async function loadData() {
    try {
      setError("");

      const [
        fleetRes,
        tripsRes,
        driversRes,
      ] = await Promise.all([
        api.get("/dispatch/fleet"),
        api.get("/dispatch/trips"),
        api.get("/dispatch/drivers"),
      ]);

      setAmbulances(
        fleetRes.data.ambulances || []
      );

      setTrips(
        tripsRes.data.trips || []
      );

      setDrivers(
        driversRes.data.drivers || []
      );

      return {
        ambulances:
          fleetRes.data.ambulances || [],
        trips:
          tripsRes.data.trips || [],
        drivers:
          driversRes.data.drivers || [],
      };
    } catch (err) {
      console.error(err);

      setError(
        err.response?.data?.message ||
          "Could not load dispatcher dashboard."
      );

      return null;
    }
  }

  /*
   * ==========================
   * OPEN ASSIGN MODAL
   * ==========================
   */

  function openAssignModal(trip) {
    setAssigningTrip(trip);
    setSelectedAmbulance("");
    setSelectedDriver("");
    setError("");
  }

  /*
   * ==========================
   * CLOSE ASSIGN MODAL
   * ==========================
   */

  function closeAssignModal() {
    if (assigning) return;

    setAssigningTrip(null);
    setSelectedAmbulance("");
    setSelectedDriver("");
    setError("");
  }

  /*
   * ==========================
   * ASSIGN AMBULANCE
   * ==========================
   */

  async function assignAmbulance() {
    if (!assigningTrip) return;

    if (!selectedAmbulance) {
      setError("Please select an ambulance.");
      return;
    }

    if (!selectedDriver) {
      setError("Please select a driver.");
      return;
    }

    try {
      setAssigning(true);
      setError("");

      /*
       * IMPORTANT:
       * Refresh latest backend state before
       * attempting assignment.
       */
      const freshData = await loadData();

      if (!freshData) {
        setAssigning(false);
        return;
      }

      /*
       * Find latest version of this trip.
       */

      const freshTrip =
        freshData.trips.find(
          (trip) =>
            String(trip._id) ===
            String(assigningTrip._id)
        );

      if (!freshTrip) {
        setError(
          "This emergency trip could not be found."
        );
        return;
      }

      /*
       * Trip may have already been assigned
       * from another dispatcher/session.
       */

      if (freshTrip.ambulance) {
        setError(
          "An ambulance is already assigned to this trip. Please refresh the dashboard."
        );

        setAssigningTrip(null);
        return;
      }

      /*
       * Check latest ambulance state.
       */

      const freshAmbulance =
        freshData.ambulances.find(
          (ambulance) =>
            String(ambulance._id) ===
            String(selectedAmbulance)
        );

      if (!freshAmbulance) {
        setError(
          "Selected ambulance no longer exists."
        );
        return;
      }

      if (
        freshAmbulance.status !==
        "idle"
      ) {
        setError(
          `Ambulance ${freshAmbulance.vehicleNumber} is no longer available. Current status: ${freshAmbulance.status}.`
        );
        return;
      }

      /*
       * Check latest driver state.
       */

      const freshDriver =
        freshData.drivers.find(
          (driver) =>
            String(driver._id) ===
            String(selectedDriver)
        );

      if (!freshDriver) {
        setError(
          "Selected driver is no longer available."
        );
        return;
      }

      if (
        freshDriver.isActive === false
      ) {
        setError(
          "Selected driver is no longer active."
        );
        return;
      }

      /*
       * ==========================
       * ACTUAL ASSIGNMENT
       * ==========================
       */

      const { data } = await api.patch(
        `/dispatch/trip/${freshTrip._id}/assign`,
        {
          ambulanceId:
            selectedAmbulance,
          driverId:
            selectedDriver,
        }
      );

      /*
       * Update trip
       */

      if (data.trip) {
        setTrips((prev) =>
          prev.map((trip) =>
            String(trip._id) ===
            String(data.trip._id)
              ? {
                  ...trip,
                  ...data.trip,
                }
              : trip
          )
        );

        setAssigningTrip(null);
        setSelectedAmbulance("");
        setSelectedDriver("");
      }

      /*
       * Update ambulance
       */

      if (data.ambulance) {
        setAmbulances((prev) =>
          prev.map((ambulance) =>
            String(ambulance._id) ===
            String(data.ambulance._id)
              ? {
                  ...ambulance,
                  ...data.ambulance,
                }
              : ambulance
          )
        );
      }

      /*
       * Final refresh so every dispatcher
       * value matches backend.
       */

      await loadData();
    } catch (err) {
      console.error(
        "[Dispatcher Assignment]",
        err
      );

      /*
       * Show backend's exact message.
       */

      const message =
        err.response?.data?.message ||
        "Could not assign ambulance and driver.";

      setError(message);

      /*
       * Refresh after failed assignment too,
       * because another dispatcher may have
       * changed the resource.
       */

      await loadData();
    } finally {
      setAssigning(false);
    }
  }

  /*
   * ==========================
   * DERIVED DATA
   * ==========================
   */

  const availableAmbulances =
    ambulances.filter(
      (ambulance) =>
        ambulance.status === "idle"
    );

  const availableDrivers =
    drivers.filter(
      (driver) =>
        driver.isActive !== false
    );

  const activeTrips =
    trips.filter(
      (trip) =>
        ![
          "cancelled",
          "handed_off",
        ].includes(trip.status)
    );

  /*
   * ==========================
   * UI
   * ==========================
   */

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      {/* Header */}

      <div>
        <p className="text-sm font-medium text-signal-dark">
          Dispatcher console
        </p>

        <h1 className="mt-2 font-display text-3xl font-semibold text-navy">
          Emergency operations
        </h1>

        <p className="mt-2 max-w-2xl text-sm text-ink/60">
          Monitor ambulance availability, active emergency trips and
          dispatch resources in real time.
        </p>
      </div>

      {/* Error */}

      {error && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <DispatchCaseOperations trips={trips} />

      {/* Fleet summary */}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-line bg-white p-5">
          <p className="text-xs uppercase tracking-wide text-ink/40">
            Total ambulances
          </p>

          <p className="mt-2 text-3xl font-semibold text-navy">
            {ambulances.length}
          </p>
        </div>

        <div className="rounded-xl border border-line bg-white p-5">
          <p className="text-xs uppercase tracking-wide text-ink/40">
            Available
          </p>

          <p className="mt-2 text-3xl font-semibold text-green-700">
            {availableAmbulances.length}
          </p>
        </div>

        <div className="rounded-xl border border-line bg-white p-5">
          <p className="text-xs uppercase tracking-wide text-ink/40">
            Active trips
          </p>

          <p className="mt-2 text-3xl font-semibold text-signal-dark">
            {activeTrips.length}
          </p>
        </div>

        <div className="rounded-xl border border-line bg-white p-5">
          <p className="text-xs uppercase tracking-wide text-ink/40">
            Drivers
          </p>

          <p className="mt-2 text-3xl font-semibold text-navy">
            {availableDrivers.length}
          </p>
        </div>
      </div>

      {/* Live ambulance map */}

      <section className="mt-8">
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-navy">
            Live ambulance fleet
          </h2>

          <p className="mt-1 text-sm text-ink/50">
            Monitor ambulance locations and fleet movement in real time.
          </p>
        </div>

        <div className="overflow-hidden rounded-xl border border-line bg-white">
          <GoogleMap
            ambulances={ambulances}
            trips={activeTrips}
          />
        </div>
      </section>

      {/* Active trips */}

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-navy">
              Active emergency trips
            </h2>

            <p className="mt-1 text-sm text-ink/50">
              Assign an available ambulance and driver to pending trips.
            </p>
          </div>

          <button
            onClick={loadData}
            className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-navy hover:bg-paper"
          >
            Refresh
          </button>
        </div>

        {activeTrips.length === 0 ? (
          <div className="mt-5 rounded-xl border border-line bg-white p-8 text-center">
            <p className="text-sm text-ink/50">
              No active emergency trips.
            </p>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {activeTrips.map((trip) => (
              <div
                key={trip._id}
                className="rounded-xl border border-line bg-white p-6"
              >
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-lg font-semibold text-navy">
                        Emergency #
                        {String(
                          trip._id
                        ).slice(-6)}
                      </h3>

                      <span className="rounded-full bg-navy/5 px-3 py-1 text-xs font-medium capitalize text-navy">
                        {trip.status?.replace(
                          /_/g,
                          " "
                        )}
                      </span>

                      {trip.triage?.urgencyTier && (
                        <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium capitalize text-red-700">
                          {
                            trip.triage
                              .urgencyTier
                          }
                        </span>
                      )}
                    </div>

                    <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                      <div>
                        <p className="text-xs text-ink/40">
                          Patient
                        </p>

                        <p className="mt-1 font-medium text-navy">
                          {trip.patient?.name ||
                            "Unknown patient"}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-ink/40">
                          Pickup
                        </p>

                        <p className="mt-1 text-navy">
                          {trip.address ||
                            "Location available"}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-ink/40">
                          Ambulance
                        </p>

                        <p className="mt-1 font-medium text-navy">
                          {trip.ambulance
                            ?.vehicleNumber ||
                            "Not assigned"}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-ink/40">
                          Driver
                        </p>

                        <p className="mt-1 font-medium text-navy">
                          {trip.ambulance
                            ?.driver?.name ||
                            "Not assigned"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex-shrink-0">
                    {trip.ambulance ? (
                      <div className="rounded-lg bg-green-50 px-4 py-3 text-sm">
                        <p className="font-medium text-green-800">
                          Ambulance dispatched
                        </p>

                        <p className="mt-1 text-green-700">
                          {trip.ambulance
                            .vehicleNumber ||
                            "Assigned"}
                        </p>
                      </div>
                    ) : (
                      <button
                        onClick={() =>
                          openAssignModal(
                            trip
                          )
                        }
                        className="rounded-lg bg-navy px-5 py-3 text-sm font-medium text-white hover:opacity-90"
                      >
                        Assign ambulance
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Fleet */}

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-navy">
          Ambulance fleet
        </h2>

        <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {ambulances.map(
            (ambulance) => (
              <div
                key={ambulance._id}
                className="rounded-xl border border-line bg-white p-5"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-ink/40">
                      Vehicle
                    </p>

                    <h3 className="mt-1 text-lg font-semibold text-navy">
                      🚑{" "}
                      {
                        ambulance.vehicleNumber
                      }
                    </h3>
                  </div>

                  <span className="rounded-full bg-navy/5 px-3 py-1 text-xs font-medium text-navy">
                    {ambulance.tier}
                  </span>
                </div>

                <div className="mt-5 space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-ink/50">
                      Status
                    </span>

                    <span className="font-medium capitalize text-navy">
                      {ambulance.status?.replace(
                        /_/g,
                        " "
                      )}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-ink/50">
                      Driver
                    </span>

                    <span className="font-medium text-navy">
                      {ambulance.driver
                        ?.name ||
                        "Unassigned"}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-ink/50">
                      Operator
                    </span>

                    <span className="font-medium text-navy">
                      {ambulance.operator
                        ?.name ||
                        "Unknown"}
                    </span>
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      </section>

      {/* Assignment modal */}

      {assigningTrip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-ink/40">
                  Dispatch assignment
                </p>

                <h2 className="mt-1 text-2xl font-semibold text-navy">
                  Assign resources
                </h2>

                <p className="mt-2 text-sm text-ink/50">
                  Select both an ambulance and its driver for this
                  emergency.
                </p>
              </div>

              <button
                onClick={
                  closeAssignModal
                }
                disabled={assigning}
                className="text-xl text-ink/40 hover:text-ink"
              >
                ×
              </button>
            </div>

            {/* Ambulance */}

            <div className="mt-6">
              <label className="text-sm font-medium text-navy">
                Ambulance
              </label>

              <select
                value={
                  selectedAmbulance
                }
                onChange={(e) =>
                  setSelectedAmbulance(
                    e.target.value
                  )
                }
                disabled={assigning}
                className="mt-2 w-full rounded-lg border border-line bg-white px-4 py-3 text-sm text-navy outline-none focus:border-navy"
              >
                <option value="">
                  Select ambulance
                </option>

                {availableAmbulances.map(
                  (ambulance) => (
                    <option
                      key={
                        ambulance._id
                      }
                      value={
                        ambulance._id
                      }
                    >
                      {
                        ambulance.vehicleNumber
                      }{" "}
                      — {ambulance.tier}
                    </option>
                  )
                )}
              </select>

              {availableAmbulances.length ===
                0 && (
                <p className="mt-2 text-xs text-red-600">
                  No idle ambulance is currently available.
                </p>
              )}
            </div>

            {/* Driver */}

            <div className="mt-5">
              <label className="text-sm font-medium text-navy">
                Driver
              </label>

              <select
                value={selectedDriver}
                onChange={(e) =>
                  setSelectedDriver(
                    e.target.value
                  )
                }
                disabled={assigning}
                className="mt-2 w-full rounded-lg border border-line bg-white px-4 py-3 text-sm text-navy outline-none focus:border-navy"
              >
                <option value="">
                  Select driver
                </option>

                {availableDrivers.map(
                  (driver) => (
                    <option
                      key={driver._id}
                      value={driver._id}
                    >
                      {driver.name}
                      {driver.phone
                        ? ` — ${driver.phone}`
                        : ""}
                    </option>
                  )
                )}
              </select>

              {availableDrivers.length ===
                0 && (
                <p className="mt-2 text-xs text-red-600">
                  No active drivers are available.
                </p>
              )}
            </div>

            {/* Buttons */}

            <div className="mt-7 flex justify-end gap-3">
              <button
                onClick={
                  closeAssignModal
                }
                disabled={assigning}
                className="rounded-lg border border-line px-5 py-3 text-sm font-medium text-navy"
              >
                Cancel
              </button>

              <button
                onClick={
                  assignAmbulance
                }
                disabled={
                  assigning ||
                  !selectedAmbulance ||
                  !selectedDriver
                }
                className="rounded-lg bg-navy px-5 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {assigning
                  ? "Checking & assigning..."
                  : "Assign & Dispatch"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}