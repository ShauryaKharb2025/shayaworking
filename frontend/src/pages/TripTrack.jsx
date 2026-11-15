import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useNavigate,
  useParams,
} from "react-router-dom";

import api from "../api/axios";

import {
  connectSocket,
} from "../api/socket";

import GoogleMap from "../components/GoogleMap";

const STATUS_LABEL = {
  requested:
    "Checking coverage…",

  waitlisted:
    "Queued — no free ambulance nearby yet",

  matched:
    "Ambulance matched",

  dispatched:
    "Ambulance dispatched",

  en_route:
    "Ambulance is on the way to you",

  arrived_pickup:
    "Ambulance has arrived",

  en_route_hospital:
    "En route to hospital",

  handed_off:
    "Handed off at hospital",

  cancelled:
    "Cancelled",
};

export default function TripTrack() {
  const { id } =
    useParams();

  const navigate =
    useNavigate();

  const [
    trip,
    setTrip,
  ] = useState(null);

  const [
    live,
    setLive,
  ] = useState(null);

  const [
    error,
    setError,
  ] = useState("");

  const [
    cancelling,
    setCancelling,
  ] = useState(false);

  const [
    messages,
    setMessages,
  ] = useState([]);

  const [
    messageText,
    setMessageText,
  ] = useState("");

  const [
    sendingMessage,
    setSendingMessage,
  ] = useState(false);

  /*
   * ==========================
   * LOAD TRIP + SOCKET
   * ==========================
   */

  useEffect(() => {
    let mounted = true;

    api
      .get(`/sos/${id}`)
      .then(({ data }) => {
        console.log(
          "🚨 PATIENT TRIP DATA:",
          data.trip
        );

        if (mounted) {
          setTrip(
            data.trip
          );
        }
      })
      .catch((err) => {
        if (mounted) {
          setError(
            err.response?.data
              ?.message ||
              "Couldn't load this trip."
          );
        }
      });

    /*
     * Load communication history.
     */

    api
      .get(
        `/dispatch/trip/${id}/contacts`
      )
      .then(({ data }) => {
        if (mounted) {
          setMessages(
            data.messages || []
          );
        }
      })
      .catch((err) => {
        console.error(
          "Could not load trip contacts:",
          err
        );
      });

    const socket =
      connectSocket();

    socket.on(
      "connect",
      () => {
        console.log(
          "🟢 PATIENT SOCKET CONNECTED:",
          socket.id
        );

        socket.emit(
          "join:trip",
          id
        );
      }
    );

    socket.on(
      "connect_error",
      (err) => {
        console.error(
          "❌ PATIENT SOCKET ERROR:",
          err.message
        );
      }
    );

    /*
     * ==========================
     * TRIP MATCHED
     * ==========================
     */

    socket.on(
      "trip:matched",
      (payload) => {
        setTrip(
          (current) => {
            if (!current) {
              return current;
            }

            return {
              ...current,

              ambulance:
                payload.ambulance,

              status:
                "matched",
            };
          }
        );
      }
    );

    /*
     * ==========================
     * STATUS
     * ==========================
     */

 socket.on(
  "trip:status",
  async (payload) => {
    setTrip(
      (current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          status:
            payload.status,
          ...(payload.ambulance
            ? {
                ambulance:
                  payload.ambulance,
              }
            : {}),
        };
      }
    );

    /*
     * Manual dispatcher assignment may send
     * only the new status. In that case,
     * fetch the latest trip so the patient
     * immediately receives the ambulance
     * information and marker.
     */
    if (
      payload.status ===
        "matched" ||
      payload.status ===
        "dispatched" ||
      payload.status ===
        "en_route"
    ) {
      try {
        const { data } =
          await api.get(
            `/sos/${id}`
          );

        if (data?.trip) {
          setTrip(
            data.trip
          );
        }
      } catch (err) {
        console.error(
          "Could not refresh trip after status update:",
          err
        );
      }
    }
  }
);
    /*
     * ==========================
     * LIVE LOCATION
     * ==========================
     */

    socket.on(
      "trip:location",
      (payload) => {
        setLive({
          lat: Number(
            payload.lat
          ),

          lng: Number(
            payload.lng
          ),

          heading:
            payload.heading,
        });
      }
    );

    /*
     * ==========================
     * MESSAGE
     * ==========================
     */

    socket.on(
      "trip:message",
      (payload) => {
        if (
          String(
            payload.tripId
          ) !== String(id)
        ) {
          return;
        }

        setMessages(
          (current) => [
            ...current,
            payload.message,
          ]
        );
      }
    );

    return () => {
      mounted = false;

      socket.off(
        "trip:matched"
      );

      socket.off(
        "trip:status"
      );

      socket.off(
        "trip:location"
      );

      socket.off(
        "trip:message"
      );

      socket.off(
        "connect"
      );

      socket.off(
        "connect_error"
      );
    };
  }, [id]);

  /*
   * ==========================
   * SEND MESSAGE
   * ==========================
   */

  function sendMessage() {
    const text =
      messageText.trim();

    if (
      !text ||
      sendingMessage
    ) {
      return;
    }

    const socket =
      connectSocket();

    setSendingMessage(
      true
    );

    socket.emit(
      "trip:message:send",
      {
        tripId: id,
        text,
      }
    );

    setMessageText("");

    setTimeout(() => {
      setSendingMessage(
        false
      );
    }, 300);
  }

  /*
   * ==========================
   * CALL DRIVER
   * ==========================
   */

  async function callDriver() {
    try {
      setError("");

      const { data } =
        await api.get(
          `/dispatch/trip/${id}/contacts`
        );

      const phone =
        data.driver?.phone;

      if (!phone) {
        setError(
          "Driver phone number is not available."
        );

        return;
      }

      window.location.href =
        `tel:${phone}`;
    } catch (err) {
      console.error(
        "Call driver error:",
        err
      );

      setError(
        "Could not start the call."
      );
    }
  }

  /*
   * ==========================
   * CANCEL
   * ==========================
   */

  const handleCancelRequest =
    async () => {
      if (cancelling) {
        return;
      }

      const confirmed =
        window.confirm(
          "Are you sure you want to cancel this ambulance request?"
        );

      if (!confirmed) {
        return;
      }

      try {
        setCancelling(
          true
        );

        setError("");

        await api.patch(
          `/dispatch/trip/${id}/status`,
          {
            status:
              "cancelled",
          }
        );

        setTrip(
          (current) =>
            current
              ? {
                  ...current,
                  status:
                    "cancelled",
                }
              : current
        );

        setTimeout(() => {
          navigate(
            "/patient"
          );
        }, 800);
      } catch (err) {
        console.error(
          "❌ CANCEL REQUEST ERROR:",
          err
        );

        setError(
          err.response?.data
            ?.message ||
            "Could not cancel the ambulance request."
        );

        setCancelling(
          false
        );
      }
    };

  /*
   * ==========================
   * PATIENT LOCATION
   * ==========================
   */

  const patientLocation =
    useMemo(() => {
      const coordinates =
        trip?.pickupLocation
          ?.coordinates;

      if (
        Array.isArray(
          coordinates
        ) &&
        coordinates.length >= 2
      ) {
        return {
          lng: Number(
            coordinates[0]
          ),

          lat: Number(
            coordinates[1]
          ),
        };
      }

      return null;
    }, [trip]);

  /*
   * ==========================
   * AMBULANCE LOCATION
   * ==========================
   */

  const ambulanceLocation =
    useMemo(() => {
      if (live) {
        return {
          lng: Number(
            live.lng
          ),

          lat: Number(
            live.lat
          ),
        };
      }

      const coordinates =
        trip?.ambulance
          ?.location
          ?.coordinates;

      if (
        Array.isArray(
          coordinates
        ) &&
        coordinates.length >= 2
      ) {
        return {
          lng: Number(
            coordinates[0]
          ),

          lat: Number(
            coordinates[1]
          ),
        };
      }

      return null;
    }, [live, trip]);

  /*
   * ==========================
   * MAP MARKERS
   * ==========================
   */
const markers =
  useMemo(() => {
    const result = [];

    /*
     * ============================
     * PICKUP MARKER
     * ============================
     */
    if (
      patientLocation &&
      Number.isFinite(
        Number(
          patientLocation.lat
        )
      ) &&
      Number.isFinite(
        Number(
          patientLocation.lng
        )
      )
    ) {
      result.push({
        id: `patient-${id}`,

        lat: Number(
          patientLocation.lat
        ),

        lng: Number(
          patientLocation.lng
        ),

        title:
          "Patient pickup",

        label:
          "Pickup location",

        status:
          "patient",
      });
    }

    /*
     * ============================
     * AMBULANCE MARKER
     * ============================
     *
     * Live GPS has priority.
     * If live GPS hasn't arrived yet,
     * use ambulance's stored location.
     */
    if (
      ambulanceLocation &&
      trip?.status !==
        "cancelled" &&
      Number.isFinite(
        Number(
          ambulanceLocation.lat
        )
      ) &&
      Number.isFinite(
        Number(
          ambulanceLocation.lng
        )
      )
    ) {
      result.push({
        id: `ambulance-${trip?.ambulance?._id || id}`,

        lat: Number(
          ambulanceLocation.lat
        ),

        lng: Number(
          ambulanceLocation.lng
        ),

        title:
          trip?.ambulance
            ?.vehicleNumber
            ? `Ambulance ${trip.ambulance.vehicleNumber}`
            : "Ambulance",

        label:
          trip?.ambulance
            ?.tier ||
          "Ambulance",

        status:
          trip?.status ===
            "dispatched"
            ? "dispatched"
            : "en_route",
      });
    }

    return result;
  }, [
    id,
    patientLocation,
    ambulanceLocation,
    trip,
  ]);

  /*
   * ==========================
   * ERROR
   * ==========================
   */

  if (error) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16">
        <p className="text-signal-dark">
          {error}
        </p>

        <button
          onClick={() =>
            setError("")
          }
          className="mt-4 rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white"
        >
          Dismiss
        </button>
      </div>
    );
  }

  /*
   * ==========================
   * LOADING
   * ==========================
   */

  if (!trip) {
    return (
      <p className="mx-auto max-w-xl px-6 py-16 text-ink/50">
        Loading trip…
      </p>
    );
  }

  /*
   * ==========================
   * CANCELLED
   * ==========================
   */

  if (
    trip.status ===
    "cancelled"
  ) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-20 text-center">
        <div className="rounded-2xl border border-line bg-white p-10 shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-signal-dark/10 text-3xl">
            ✓
          </div>

          <h1 className="mt-6 font-display text-3xl font-semibold text-navy">
            Ambulance request
            cancelled
          </h1>

          <p className="mt-3 text-ink/60">
            Your ambulance request
            has been successfully
            cancelled.
          </p>

          <button
            onClick={() =>
              navigate(
                "/patient"
              )
            }
            className="mt-8 rounded-xl bg-navy px-6 py-3 font-semibold text-white"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  /*
   * ==========================
   * ACTIVE TRIP
   * ==========================
   */

  const communicationEnabled =
    ![
      "handed_off",
      "cancelled",
    ].includes(
      trip.status
    );

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">

      {/* HEADER */}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-signal-dark">
            Live emergency trip
          </p>

          <h1 className="mt-2 font-display text-3xl font-semibold text-navy">
            {STATUS_LABEL[
              trip.status
            ] ||
              trip.status}
          </h1>
        </div>

        {[
          "requested",
          "waitlisted",
          "offered",
          "matched",
          "dispatched",
          "en_route",
          "arrived_pickup",
        ].includes(trip.status) && (
          <button
            onClick={handleCancelRequest}
            disabled={cancelling}
            className="rounded-full border border-red-300 bg-red-50 px-5 py-2.5 text-xs font-semibold text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cancelling ? "Cancelling…" : "✕ Cancel Request"}
          </button>
        )}
      </div>

      {/* COVERAGE */}

      {trip.coverageState ===
        "coming_soon" && (
        <p className="mt-4 rounded-lg bg-amber/10 px-4 py-3 text-sm text-amber">
          This area isn't live yet —
          your request is on our
          priority list. Dial 112 in
          parallel for immediate help.
        </p>
      )}

      {/* MAP */}

      <div className="mt-8 overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
        <div className="h-[520px]">
          {markers.length > 0 ? (
            <GoogleMap
              center={
                patientLocation || {
                  lat: 28.6139,
                  lng: 77.209,
                }
              }
              zoom={14}
              markers={
                markers
              }
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-ink/50">
              Waiting for location…
            </div>
          )}
        </div>
      </div>

      {/* TRIP INFORMATION */}

      <div className="mt-6 rounded-2xl border border-line bg-white p-6">

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">

          <div>
            <p className="text-sm text-ink/50">
              ETA
            </p>

            <p className="mt-1 text-xl font-semibold text-navy">
              {trip.etaMinutes
                ? `${trip.etaMinutes} min`
                : "Updating…"}
            </p>
          </div>

          <div>
            <p className="text-sm text-ink/50">
              Ambulance
            </p>

            <p className="mt-1 text-xl font-semibold text-navy">
              {trip.ambulance
                ?.vehicleNumber ||
                "Matching…"}
            </p>
          </div>

          <div>
            <p className="text-sm text-ink/50">
              Tier
            </p>

            <p className="mt-1 text-xl font-semibold text-navy">
              {trip.ambulance
                ?.tier ||
                trip.triage
                  ?.suggestedAmbulanceTier ||
                "—"}
            </p>
          </div>

          <div>
            <p className="text-sm text-ink/50">
              Urgency
            </p>

            <p className="mt-1 text-xl font-semibold capitalize text-navy">
              {trip.triage
                ?.urgencyTier ||
                "—"}
            </p>
          </div>

        </div>

        {/* ==========================
            PICKUP LOCATION
        ========================== */}

        <div className="mt-6 rounded-xl bg-paper p-4">

          <p className="text-xs font-medium uppercase tracking-wide text-ink/50">
            PICKUP LOCATION
          </p>

          <p className="mt-1 text-sm font-semibold text-navy">
            {trip.address ||
              "Location unavailable"}
          </p>

        </div>

        {/* ==========================
            LIVE AMBULANCE LOCATION
        ========================== */}

        {live && (
          <div className="mt-4 rounded-xl bg-paper p-4">

            <div className="flex items-center gap-2">

              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-signal-dark" />

              <p className="text-xs font-medium uppercase tracking-wide text-ink/50">
                LIVE AMBULANCE LOCATION
              </p>

            </div>

            <p className="mt-1 text-sm font-semibold text-navy">
              Ambulance is currently moving
              toward your pickup location
            </p>

            <p className="mt-1 text-xs text-ink/50">
              Live GPS tracking is active
            </p>

          </div>
        )}

      </div>

      {/* ==========================
          DRIVER COMMUNICATION
      ========================== */}

      {communicationEnabled &&
        trip.ambulance && (
          <div className="mt-6 rounded-2xl border border-line bg-white p-6 shadow-sm">

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

              <div>
                <p className="text-xs uppercase tracking-wide text-ink/40">
                  Ambulance driver
                </p>

                <h2 className="mt-1 font-display text-xl font-semibold text-navy">
                  {trip.ambulance
                    ?.driver?.name ||
                    "Assigned driver"}
                </h2>
              </div>

              <button
                onClick={
                  callDriver
                }
                className="rounded-xl bg-navy px-5 py-3 text-sm font-semibold text-white"
              >
                📞 Call Driver
              </button>

            </div>

            {/* CHAT */}

            <div className="mt-6 max-h-72 space-y-3 overflow-y-auto rounded-xl bg-paper p-4">

              {messages.length ===
                0 && (
                <p className="text-center text-sm text-ink/40">
                  No messages yet.
                </p>
              )}

              {messages.map(
                (message) => {
                  const mine =
                    message.senderRole ===
                      "patient" ||
                    message.senderRole ===
                      "caregiver";

                  return (
                    <div
                      key={
                        message._id ||
                        `${message.at}-${message.text}`
                      }
                      className={`flex ${
                        mine
                          ? "justify-end"
                          : "justify-start"
                      }`}
                    >

                      <div
                        className={`max-w-[80%] rounded-xl px-4 py-3 ${
                          mine
                            ? "bg-navy text-white"
                            : "bg-white text-navy"
                        }`}
                      >

                        <p className="text-xs opacity-60">
                          {mine
                            ? "You"
                            : "Driver"}
                        </p>

                        <p className="mt-1 text-sm">
                          {
                            message.text
                          }
                        </p>

                      </div>

                    </div>
                  );
                }
              )}

            </div>

            <div className="mt-4 flex gap-2">

              <input
                value={
                  messageText
                }
                onChange={(e) =>
                  setMessageText(
                    e.target.value
                  )
                }
                onKeyDown={(e) => {
                  if (
                    e.key ===
                    "Enter"
                  ) {
                    sendMessage();
                  }
                }}
                maxLength={500}
                placeholder="Message driver…"
                className="min-w-0 flex-1 rounded-xl border border-line px-4 py-3 text-sm outline-none focus:border-navy"
              />

              <button
                onClick={
                  sendMessage
                }
                disabled={
                  !messageText.trim() ||
                  sendingMessage
                }
                className="rounded-xl bg-navy px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                Send
              </button>

            </div>

          </div>
        )}

      {/* ==========================
          CANCEL
      ========================== */}

      {[
        "requested",
        "waitlisted",
        "offered",
        "matched",
        "dispatched",
        "en_route",
        "arrived_pickup",
      ].includes(
        trip.status
      ) && (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5">

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

            <div>

              <p className="font-semibold text-red-700">
                Need to cancel?
              </p>

              <p className="mt-1 text-sm text-red-600/80">
                Cancel this ambulance
                request if you no longer
                need the ambulance.
              </p>

            </div>

            <button
              onClick={
                handleCancelRequest
              }
              disabled={
                cancelling
              }
              className="rounded-xl border border-red-300 bg-white px-5 py-3 text-sm font-semibold text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {cancelling
                ? "Cancelling…"
                : "Cancel Ambulance Request"}
            </button>

          </div>

        </div>
      )}

      <p className="mt-6 text-xs text-ink/40">
        Your ambulance location updates
        automatically as the driver moves.
      </p>

    </div>
  );
}