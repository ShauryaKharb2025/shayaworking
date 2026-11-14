const axios = require("axios");
const Trip = require("../models/Trip");
const CoverageZone = require("../models/CoverageZone");

const EARTH_RADIUS_KM = 6371;

function haversineKm([lng1, lat1], [lng2, lat2]) {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;

  return (
    EARTH_RADIUS_KM *
    2 *
    Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  );
}

/**
 * Step 1: coverage check for a given point.
 *
 * LIVE / LIMITED -> request can enter dispatch queue
 * Otherwise -> waitlist
 */
async function checkCoverage(lng, lat) {
  const spatial = await require('../data/spatial').coverageAt(lng, lat);
  if (spatial !== undefined) return spatial;
  const zones = await CoverageZone.find({
    status: { $in: ["live", "limited"] },
  });

  for (const zone of zones) {
    const [zLng, zLat] = zone.center.coordinates;

    if (haversineKm([lng, lat], [zLng, zLat]) <= zone.radiusKm) {
      return zone.status;
    }
  }

  return "coming_soon";
}

/**
 * POST /api/sos
 *
 * Body:
 * {
 *   lng,
 *   lat,
 *   address,
 *   channel,
 *   symptoms: [string]
 * }
 *
 * HYBRID DISPATCH FLOW:
 *
 * SOS
 *   ↓
 * Coverage check
 *   ↓
 * AI triage
 *   ↓
 * requested
 *   ↓
 * Dispatcher queue
 *   ↓
 * Dispatcher can manually assign
 *   ↓
 * If not assigned within 5 minutes:
 * automatic dispatch service handles fallback
 *
 * IMPORTANT:
 * This controller does NOT assign an ambulance immediately.
 * Manual dispatch is handled by dispatchController.js.
 * Automatic fallback will be handled separately.
 */
async function createSOS(req, res) {
  try {
    const {
      lng,
      lat,
      address,
      channel = "app",
      symptoms = [],
      requestedAmbulanceTier,
    } = req.body;

    // ---------------------------------------------------------
    // 1. Validate location
    // ---------------------------------------------------------

    if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng)>180 || Math.abs(lat)>90) {
      return res.status(400).json({
        message: "lng and lat are required numbers",
      });
    }

    // ---------------------------------------------------------
    // 2. Check coverage
    // ---------------------------------------------------------

    if (!Array.isArray(symptoms) || symptoms.some(value => typeof value !== "string") ||
        (requestedAmbulanceTier && !["ALS", "BLS"].includes(requestedAmbulanceTier))) {
      return res.status(400).json({message:"Provide symptoms as text and an ALS or BLS preference."});
    }
    const coverage = await checkCoverage(lng, lat);

    // ---------------------------------------------------------
    // 3. Create trip
    //
    // Covered area:
    //     requested
    //
    // Not covered:
    //     waitlisted
    // ---------------------------------------------------------
const isCovered =
  coverage === "live" || coverage === "limited";

const trip = await Trip.create({
  patient: req.user.sub,
  channel,
  symptoms,
  requestedAmbulanceTier,

  pickupLocation: {
    type: "Point",
    coordinates: [lng, lat],
  },

  address,

  coverageState:
    coverage === "coming_soon"
      ? "coming_soon"
      : coverage,

  status: isCovered
    ? "requested"
    : "waitlisted",

  // Dispatcher gets 5 minutes to assign manually.
  // After that, the auto-dispatch worker can take over.
  autoDispatchAt: isCovered
    ? new Date(Date.now() + 5 * 60 * 1000)
    : null,
});
    // ---------------------------------------------------------
    // 4. AI/ML triage
    //
    // Triage happens before dispatch.
    // The result is stored on the trip so the dispatcher
    // and automatic dispatch service can use it later.
    // ---------------------------------------------------------

    if (
      process.env.AI_SERVICE_URL && symptoms.length &&
      (coverage === "live" || coverage === "limited")
    ) {
      try {
        const { data } = await axios.post(
          `${process.env.AI_SERVICE_URL}/triage`,
          { symptoms }, { timeout: 5000 }
        );

        trip.triage = {
          urgencyTier: data.urgency_tier,
          suggestedEquipment: data.suggested_equipment,
          suggestedAmbulanceTier: data.suggested_ambulance_tier,
          notes: data.notes,
        };

        await trip.save();
      } catch (aiErr) {
        // Triage failure should NOT cancel the emergency request.
        // The trip remains valid and can still be dispatched.
        console.warn(
          "[sos] triage service unavailable, continuing without it:",
          aiErr.message
        );
      }
    }

    // ---------------------------------------------------------
    // 5. Area not covered
    //
    // Keep your existing waitlist behaviour.
    // ---------------------------------------------------------

    if (coverage === "coming_soon") {
      return res.status(201).json({
        trip,

        message:
          "Request received. This area isn't live yet — you're on the priority waitlist.",

        parallelChannels: ["official_helpline_112"],
      });
    }

    // ---------------------------------------------------------
    // 6. IMPORTANT:
    //
    // DO NOT FIND AN AMBULANCE HERE.
    //
    // Previously this controller:
    //
    //     found nearest ambulance
    //     changed ambulance.status
    //     attached ambulance to trip
    //     changed trip to matched
    //     calculated ETA
    //
    // That caused the dispatcher flow to break because
    // dispatchController.js then saw:
    //
    //     trip.ambulance already exists
    //
    // and rejected manual assignment.
    //
    // Now the trip stays:
    //
    //     status    = "requested"
    //     ambulance = null
    //
    // This gives the dispatcher the first opportunity to assign.
    // ---------------------------------------------------------

    const io = req.app.get("io");

    // ---------------------------------------------------------
    // 7. Notify dispatcher dashboard
    //
    // The dispatcher dashboard already listens for dispatch:new,
    // so we keep that existing event instead of introducing
    // another frontend event.
    // ---------------------------------------------------------

    io?.to("dispatcher").emit("dispatch:new", {
      trip,
    });

    // ---------------------------------------------------------
    // 8. Return request to frontend
    // ---------------------------------------------------------

    return res.status(201).json({
      trip,

      message:
        "Emergency request received and sent to the dispatcher queue.",

      parallelChannels: ["official_helpline_112"],
    });
  } catch (err) {
    console.error("[sos] createSOS error:", err);

    return res.status(500).json({
      message: "Could not process SOS request",
    });
  }
}

/**
 * GET /api/sos/:id
 *
 * Patient/caregiver trip-only view.
 *
 * KEEPING EXISTING BEHAVIOUR UNCHANGED.
 */
async function getTrip(req, res, next) {
  try {
    const trip = await Trip.findById(req.params.id)
      .populate("ambulance")
      .populate("hospital");

    if (!trip) {
      return res.status(404).json({
        message: "Trip not found",
      });
    }

    const userId = String(req.user.sub);
    let allowed = ["dispatcher", "admin"].includes(req.user.role) || String(trip.patient) === userId;
    if (!allowed && req.user.role === "driver" && !["cancelled", "handed_off"].includes(trip.status)) {
      allowed = String(trip.ambulance?.driver) === userId;
    }
    if (!allowed && ["hospital", "operator"].includes(req.user.role)) {
      const account = await require("../models/User").findById(userId);
      allowed = req.user.role === "hospital"
        ? !!account?.hospital && String(trip.hospital?._id) === String(account.hospital)
        : !!account?.operator && String(trip.ambulance?.operator) === String(account.operator);
    }
    if (!allowed) return res.status(403).json({message:"You do not have access to this case."});
    const referral = await require("../data/prisma").hospitalReferral.findFirst({
      where: { tripId: trip._id, status: { in: ["proposed", "accepted"] } },
      select: { status: true, hospital: { select: { name: true } } },
    });
    const result = { ...trip.toJSON(), proposedHospital: referral?.hospital || null };
    if (trip.status === "offered" && req.user.role === "patient") {
      return res.json({ trip: { ...result, ambulance: null, events: trip.events.filter(event => !["ambulance:offered", "ambulance:auto_offered"].includes(event.type)) } });
    }
    return res.json({ trip: result });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/sos
 *
 * List current user's trips.
 *
 * KEEPING EXISTING BEHAVIOUR UNCHANGED.
 */
async function myTrips(req, res) {
  const trips = await Trip.find({
    patient: req.user.sub,
  })
    .sort({ createdAt: -1 })
    .limit(20);

  return res.json({ trips: trips.map(trip => trip.status === "offered" ? {
    ...trip.toJSON(), ambulance: null, events: trip.events.filter(event => !["ambulance:offered", "ambulance:auto_offered"].includes(event.type)),
  } : trip) });
}

module.exports = {
  createSOS,
  getTrip,
  myTrips,
};