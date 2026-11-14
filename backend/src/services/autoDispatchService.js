const Trip = require("../models/Trip");
const Ambulance = require("../models/Ambulance");
const User = require("../models/User");

const POLL_INTERVAL = 10 * 1000; // 10 seconds

function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;

  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;

  return (
    R *
    2 *
    Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  );
}

function tierScore(ambulanceTier, requiredTier) {
  if (!requiredTier) return 0;

  if (ambulanceTier === requiredTier) {
    return 100;
  }

  // ALS can handle a BLS requirement.
  if (
    requiredTier === "BLS" &&
    ambulanceTier === "ALS"
  ) {
    return 50;
  }

  return -100;
}

function equipmentScore(ambulanceEquipment, requiredEquipment) {
  if (!requiredEquipment?.length) {
    return 0;
  }

  const equipment = new Set(
    (ambulanceEquipment || []).map((item) =>
      String(item).toLowerCase()
    )
  );

  let score = 0;

  for (const required of requiredEquipment) {
    if (equipment.has(String(required).toLowerCase())) {
      score += 20;
    } else {
      score -= 100;
    }
  }

  return score;
}

async function isDriverBusy(driverId) {
  const activeTrip = await Trip.exists({
    "ambulance": {
      $exists: true,
    },

    status: {
      $in: [
        "dispatched",
        "en_route",
        "arrived_pickup",
        "en_route_hospital",
      ],
    },
  });

  if (!activeTrip) {
    return false;
  }

  const ambulance = await Ambulance.exists({
    driver: driverId,
    status: {
      $in: [
        "dispatched",
        "en_route",
        "stale",
      ],
    },
  });

  return !!ambulance;
}

async function findDriver() {
  const drivers = await User.find({
    role: "driver",
  }).select("_id name email phone");

  for (const driver of drivers) {
    const busy = await isDriverBusy(driver._id);

    if (!busy) {
      return driver;
    }
  }

  return null;
}

async function findBestAmbulance(trip) {
  const [lng, lat] =
    trip.pickupLocation.coordinates;

  const ambulances = await Ambulance.find({
    status: "idle",
  }).populate("driver", "name email phone");

  if (!ambulances.length) {
    return null;
  }

  const requiredTier =
    trip.triage?.suggestedAmbulanceTier;

  const requiredEquipment =
    trip.triage?.suggestedEquipment || [];

  const ranked = ambulances
    .map((ambulance) => {
      const ambulanceLat =
        ambulance.location?.coordinates?.[1];

      const ambulanceLng =
        ambulance.location?.coordinates?.[0];

      let distance = Number.MAX_SAFE_INTEGER;

      if (
        Number.isFinite(ambulanceLat) &&
        Number.isFinite(ambulanceLng)
      ) {
        distance = distanceKm(
          lat,
          lng,
          ambulanceLat,
          ambulanceLng
        );
      }

      const score =
        tierScore(
          ambulance.tier,
          requiredTier
        ) +
        equipmentScore(
          ambulance.equipment,
          requiredEquipment
        ) -
        distance;

      return {
        ambulance,
        score,
        distance,
      };
    })
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.ambulance || null;
}

async function processAutoDispatch(io) {
  const now = new Date();

  const trips = await Trip.find({
    status: "requested",
    autoDispatchAt: {
      $lte: now,
    },
    ambulance: null,
  })
    .sort({
      autoDispatchAt: 1,
    })
    .limit(20);

  for (const trip of trips) {
    try {
      /*
       * Re-check the trip immediately before assignment.
       * This protects against a dispatcher assigning it
       * while the worker is processing it.
       */
      const freshTrip = await Trip.findOne({
        _id: trip._id,
        status: "requested",
        autoDispatchAt: {
          $lte: new Date(),
        },
        ambulance: null,
      });

      if (!freshTrip) {
        continue;
      }

      const ambulance =
        await findBestAmbulance(freshTrip);

      if (!ambulance) {
        console.log(
          `[auto-dispatch] No idle ambulance for trip ${freshTrip._id}`
        );
        continue;
      }

      const driver =
        await findDriver();

      if (!driver) {
        console.log(
          `[auto-dispatch] No available driver for trip ${freshTrip._id}`
        );
        continue;
      }

      /*
       * Atomically reserve the ambulance.
       * If another process already took it,
       * this returns null and we move on.
       */
      const reserved = await require("./reservationService").reserveAutoDispatch(
        freshTrip._id, ambulance._id, driver._id
      );
      if (!reserved) continue;
      const claimedAmbulance = await Ambulance.findById(ambulance._id)
        .populate("driver", "name email phone");
      const assignedTrip = await Trip.findById(freshTrip._id)
        .populate("patient", "name phone")
        .populate({ path: "ambulance", populate: { path: "driver", select: "name email phone" } });

      console.log(
        `[auto-dispatch] Trip ${assignedTrip._id} assigned to ${claimedAmbulance.vehicleNumber}`
      );

      /*
       * Notify dispatcher.
       */
      io?.emit("trip:assigned", {
        tripId: assignedTrip._id,
        trip: assignedTrip,
        ambulance: claimedAmbulance,
        source: "auto",
      });

      /*
       * Notify patient.
       */
      io
        ?.to(`trip:${assignedTrip._id}`)
        .emit("trip:status", {
          tripId: assignedTrip._id,
          status: "dispatched",
          ambulance: claimedTripAmbulance(
            assignedTrip
          ),
          source: "auto",
        });

      /*
       * Notify driver's room.
       */
      io
        ?.to(`driver:${driver._id}`)
        .emit("trip:assigned", {
          tripId: assignedTrip._id,
          trip: assignedTrip,
          ambulance: claimedAmbulance,
          source: "auto",
        });

      /*
       * Also emit trip:matched because the existing
       * frontend already uses this event in the
       * tracking flow.
       */
      io
        ?.to(`trip:${assignedTrip._id}`)
        .emit("trip:matched", {
          tripId: assignedTrip._id,
          ambulance: claimedTripAmbulance(
            assignedTrip
          ),
        });

      io
        ?.to(`driver:${driver._id}`)
        .emit("trip:matched", {
          tripId: assignedTrip._id,
          trip: assignedTrip,
          ambulance: claimedAmbulance,
        });
    } catch (error) {
      console.error(
        `[auto-dispatch] Failed for trip ${trip._id}:`,
        error
      );
    }
  }
}

function claimedTripAmbulance(trip) {
  return trip?.ambulance || null;
}

function startAutoDispatchWorker(io) {
  console.log(
    "[auto-dispatch] Worker started"
  );

  processAutoDispatch(io).catch((error) => {
    console.error(
      "[auto-dispatch] Initial run failed:",
      error
    );
  });

  setInterval(() => {
    processAutoDispatch(io).catch((error) => {
      console.error(
        "[auto-dispatch] Worker error:",
        error
      );
    });
  }, POLL_INTERVAL);
}

module.exports = {
  startAutoDispatchWorker,
};