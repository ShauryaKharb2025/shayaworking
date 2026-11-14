const { kickOrchestration } = require("../services/autoDispatchService");
const prisma = require("../data/prisma");
const { ambulanceCandidates, distanceKm } = require("../services/matching");
const Trip = require("../models/Trip");
const Ambulance = require("../models/Ambulance");
const User = require("../models/User");

/*
 * ==========================
 * DISPATCHER FLEET
 * ==========================
 */

async function fleet(req, res) {
  try {
    const ambulances = await Ambulance.find({
      status: { $ne: "offline" },
    })
      .populate("operator", "name type")
      .populate("driver", "name email phone");

    return res.json({ ambulances });
  } catch (err) {
    console.error("[dispatch] fleet error:", err);

    return res.status(err.status || (["P2002", "P2003", "P2004"].includes(err.code) ? 409 : 500)).json({
      message: "Could not load fleet",
    });
  }
}

/*
 * ==========================
 * AVAILABLE DRIVERS
 * ==========================
 */

async function drivers(req, res) {
  try {
    const users = await User.find({
      role: "driver",
      isActive: true,
    }).select("name email phone");

    return res.json({
      drivers: users,
    });
  } catch (err) {
    console.error("[dispatch] drivers error:", err);

    return res.status(err.status || (["P2002", "P2003", "P2004"].includes(err.code) ? 409 : 500)).json({
      message: "Could not load drivers",
    });
  }
}

/*
 * ==========================
 * ACTIVE TRIPS
 * ==========================
 *
 * Dispatcher needs:
 * patient
 * ambulance
 * ambulance.driver
 */

async function activeTrips(req, res) {
  try {
    const trips = await Trip.find({
      status: {
        $nin: ["handed_off", "cancelled"],
      },
    })
      .populate("patient", "name phone")
      .populate({
        path: "ambulance",
        populate: {
          path: "driver",
          select: "name email phone",
        },
      })
      .sort({ createdAt: -1 });

    return res.json({ trips });
  } catch (err) {
    console.error(
      "[dispatch] active trips error:",
      err
    );

    return res.status(err.status || (["P2002", "P2003", "P2004"].includes(err.code) ? 409 : 500)).json({
      message: "Could not load active trips",
    });
  }
}

/*
 * ==========================
 * DRIVER ACTIVE TRIP
 * ==========================
 */

async function driverActiveTrip(req, res) {
  try {
    const ambulance = await Ambulance.findOne({
      driver: req.user.sub,
    }).populate(
      "operator",
      "name type verified"
    );

    if (!ambulance) {
      return res.json({
        trip: null,
        ambulance: null,
      });
    }

    const trip = await Trip.findOne({
      ambulance: ambulance._id,
      status: {
        $in: [
          "offered",
          "dispatched",
          "en_route",
          "arrived_pickup",
          "picked_up",
          "arrived_hospital",
          "en_route_hospital",
        ],
      },
    })
      .populate("patient", "name phone")
      .populate(
        "hospital",
        "name address phone"
      )
      .populate({
        path: "ambulance",
        populate: {
          path: "driver",
          select: "name email phone",
        },
      });

    return res.json({
      trip: trip || null,
      ambulance,
    });
  } catch (err) {
    console.error(
      "[dispatch] driver active trip error:",
      err
    );

    return res.status(err.status || (["P2002", "P2003", "P2004"].includes(err.code) ? 409 : 500)).json({
      message: "Could not load driver trip",
    });
  }
}

/*
 * ==========================
 * ASSIGN AMBULANCE
 * ==========================
 */

async function assignAmbulance(req, res) {
  try {
    const {
      ambulanceId,
      driverId,
    } = req.body;

    /*
     * ==========================
     * BASIC VALIDATION
     * ==========================
     */

    if (!ambulanceId) {
      return res.status(400).json({
        message: "Ambulance ID is required",
      });
    }

    if (!driverId) {
      return res.status(400).json({
        message: "Driver ID is required",
      });
    }

    /*
     * ==========================
     * FIND TRIP
     * ==========================
     */

    const trip = await Trip.findById(
      req.params.id
    );

    if (!trip) {
      return res.status(404).json({
        message: "Trip not found",
      });
    }

    /*
     * ==========================
     * TRIP STATUS CHECK
     * ==========================
     */

    if (
      ["handed_off", "cancelled"].includes(
        trip.status
      )
    ) {
      return res.status(409).json({
        message:
          "This trip is no longer active",
      });
    }

    /*
     * ==========================
     * ALREADY ASSIGNED CHECK
     * ==========================
     */

    if (trip.ambulance && trip.status !== "offered") {
      return res.status(409).json({
        message:
          "An ambulance is already assigned to this trip",
      });
    }

    if (trip.status === "offered" && trip.ambulance && String(trip.ambulance) !== String(ambulanceId)) {
      const prevAmb = await Ambulance.findById(trip.ambulance);
      if (prevAmb && prevAmb.status === "dispatched") {
        prevAmb.status = "idle";
        await prevAmb.save();
      }
    }

    /*
     * ==========================
     * FIND AMBULANCE
     * ==========================
     */

    const ambulance =
      await Ambulance.findById(
        ambulanceId
      ).populate("operator", "verified");

    if (!ambulance) {
      return res.status(404).json({
        message: "Ambulance not found",
      });
    }

    /*
     * ==========================
     * AMBULANCE AVAILABILITY
     * ==========================
     */

    const [candidate] = ambulanceCandidates(trip, [ambulance]);
    if (!candidate.eligible || !["requested", "offered"].includes(trip.status)) {
      return res.status(409).json({ message: candidate.reasons.join("; ") || "Case is not awaiting dispatch" });
    }

    /*
     * ==========================
     * FIND DRIVER
     * ==========================
     */

    const driver =
      await User.findOne({
        _id: driverId,
        role: "driver",
        isActive: true,
      });

    if (!driver) {
      return res.status(400).json({
        message:
          "Selected user is not an active driver",
      });
    }

    /*
     * ==========================
     * DRIVER ACTIVE ASSIGNMENT
     * ==========================
     */

    const driverAmbulances =
      await Ambulance.find({
        driver: driver._id,
      }).select("_id");

    const driverAmbulanceIds =
      driverAmbulances.map(
        (item) => item._id
      );

    if (
      driverAmbulanceIds.length > 0
    ) {
      const existingTrip =
        await Trip.findOne({
          _id: { $ne: trip._id },
          ambulance: {
            $in: driverAmbulanceIds,
          },
          status: {
            $in: [
              "requested",
              "waitlisted",
              "matched",
              "dispatched",
              "en_route",
              "arrived_pickup",
              "en_route_hospital",
            ],
          },
        });

      if (existingTrip) {
        return res.status(409).json({
          message:
            "This driver is already assigned to an active trip",
        });
      }
    }

    /*
     * ==========================
     * ASSIGN DRIVER
     * ==========================
     */

    ambulance.driver = driver._id;
    ambulance.status = "dispatched";

    /*
     * ==========================
     * ASSIGN AMBULANCE TO TRIP
     * ==========================
     */

    trip.ambulance = ambulance._id;
    trip.status = "offered";

    /*
     * Manual dispatcher assignment
     * cancels the automatic-dispatch timer.
     */

    trip.autoDispatchAt = new Date(Date.now() + 60_000);

    /*
     * ==========================
     * EVENT LOG
     * ==========================
     */

    trip.events.push({
      type: "ambulance:offered",
      actorId: req.user.sub,
      payload: {
        ambulanceId: ambulance._id,
        driverId: driver._id,
      },
      at: new Date(),
    });

    /*
     * ==========================
     * SAVE
     * ==========================
     */

    await require("../data/repository").transaction(async () => {
      await ambulance.save();
      await trip.save();
    });

    /*
     * ==========================
     * POPULATE AMBULANCE
     * ==========================
     */

    await ambulance.populate([
      {
        path: "operator",
        select: "name type verified",
      },
      {
        path: "driver",
        select: "name email phone",
      },
    ]);

    /*
     * ==========================
     * POPULATE TRIP
     * ==========================
     *
     * This is important.
     *
     * Driver needs patient information
     * immediately from Socket.IO.
     */

    await trip.populate([
      {
        path: "patient",
        select: "name phone email",
      },
      {
        path: "hospital",
        select: "name address phone",
      },
      {
        path: "ambulance",
        populate: {
          path: "driver",
          select: "name email phone",
        },
      },
    ]);

    /*
     * ==========================
     * SOCKET EVENTS
     * ==========================
     */

    const io = req.app.get("io");

    /*
     * ==========================
     * DISPATCHER
     * ==========================
     */

    io?.to("dispatcher").emit(
      "trip:assigned",
      {
        tripId: trip._id,
        ambulanceId: ambulance._id,
        trip,
        ambulance,
      }
    );

    /*
     * ==========================
     * PATIENT / TRIP ROOM
     * ==========================
     */

    io?.to(`trip:${trip._id}`).emit("case:refresh", { tripId: trip._id });

    /*
     * ==========================
     * DRIVER
     * ==========================
     *
     * This is the important real-time
     * assignment event.
     */

    io?.to(`driver:${driver._id}`).emit(
      "trip:assigned",
      {
        tripId: trip._id,
        ambulance,
        trip,
      }
    );
    io?.to("driver").emit("trip:assigned", { tripId: trip._id, ambulance, trip });
    io?.to(`driver:${driver._id}`).emit("case:refresh", { tripId: trip._id });
    io?.to("driver").emit("case:refresh", { tripId: trip._id });

    /*
     * ==========================
     * RESPONSE
     * ==========================
     */

    return res.json({
      message:
        "Dispatch offer sent to driver",
      trip,
      ambulance,
    });
  } catch (err) {
    console.error(
      "[dispatch] assignment error:",
      err
    );

    return res.status(err.status || (["P2002", "P2003", "P2004"].includes(err.code) ? 409 : 500)).json({
      message:
        "Could not assign ambulance",
    });
  }
}

/*
 * ==========================
 * TRIP CONTACTS + MESSAGES
 * ==========================
 */

async function tripContacts(req, res) {
  try {
    const trip = await Trip.findById(
      req.params.id
    )
      .populate(
        "patient",
        "name phone"
      )
      .populate({
        path: "ambulance",
        populate: {
          path: "driver",
          select: "name phone email",
        },
      });

    if (!trip) {
      return res.status(404).json({
        message: "Trip not found",
      });
    }

    const userId = String(
      req.user.sub
    );

    let allowed = false;

    /*
     * ==========================
     * PATIENT / CAREGIVER
     * ==========================
     */

    if (
      ["patient", "caregiver"].includes(
        req.user.role
      ) &&
      String(trip.patient?._id) ===
        userId
    ) {
      allowed = true;
    }

    /*
     * ==========================
     * DRIVER
     * ==========================
     */

    if (
      req.user.role === "driver" &&
      !["cancelled", "handed_off"].includes(trip.status) &&
      trip.ambulance?.driver &&
      String(
        trip.ambulance.driver._id
      ) === userId
    ) {
      allowed = true;
    }

    if (!allowed) {
      return res.status(403).json({
        message:
          "You are not allowed to access this trip",
      });
    }

    return res.json({
      tripId: trip._id,

      patient: trip.patient
        ? {
            name: trip.patient.name,
            phone: trip.patient.phone,
          }
        : null,

      driver: (trip.status !== "offered" || req.user.role === "driver") && trip.ambulance?.driver
        ? {
            name:
              trip.ambulance.driver.name,
            phone:
              trip.ambulance.driver.phone,
          }
        : null,

      messages: trip.messages || [],
    });
  } catch (err) {
    console.error(
      "[dispatch] contacts error:",
      err
    );

    return res.status(err.status || (["P2002", "P2003", "P2004"].includes(err.code) ? 409 : 500)).json({
      message:
        "Could not load trip contacts",
    });
  }
}

/*
 * ==========================
 * GPS UPDATE
 * ==========================
 */

async function updateAmbulanceLocation(
  req,
  res
) {
  try {
    const {
      lng,
      lat,
      heading,
    } = req.body;

    console.log(
      "[GPS UPDATE]",
      req.params.id,
      lng,
      lat,
      req.body.status
    );

    /*
     * ==========================
     * VALIDATE COORDINATES
     * ==========================
     */

    const numericLng = Number(lng);
    const numericLat = Number(lat);

    if (
      !Number.isFinite(numericLng) || Math.abs(numericLng) > 180 || Math.abs(numericLat) > 90 ||
      !Number.isFinite(numericLat)
    ) {
      return res.status(400).json({
        message:
          "Valid latitude and longitude are required",
      });
    }

    /*
     * ==========================
     * FIND AMBULANCE
     * ==========================
     */

    const ambulance =
      await Ambulance.findById(
        req.params.id
      );

    if (!ambulance) {
      return res.status(404).json({
        message: "Ambulance not found",
      });
    }

    /*
     * ==========================
     * DRIVER SECURITY
     * ==========================
     */

    if (
      req.user.role === "driver" &&
      String(ambulance.driver) !==
        String(req.user.sub)
    ) {
      return res.status(403).json({
        message:
          "You can only update your assigned ambulance",
      });
    }

    /*
     * ==========================
     * UPDATE LOCATION
     * ==========================
     */

    ambulance.location = {
      type: "Point",
      coordinates: [
        numericLng,
        numericLat,
      ],
    };

    ambulance.heading =
      heading !== undefined
        ? heading
        : ambulance.heading;

    ambulance.lastPingAt = new Date();



    await ambulance.save();

    /*
     * ==========================
     * SOCKET
     * ==========================
     */

    const io = req.app.get("io");

    /*
     * Dispatcher
     */

    io?.to("dispatcher").emit(
      "fleet:ping",
      {
        ambulanceId:
          ambulance._id,
        lng: numericLng,
        lat: numericLat,
        heading,
        status:
          ambulance.status,
      }
    );

    /*
     * ==========================
     * FIND ACTIVE TRIP
     * ==========================
     */

    const trip = await Trip.findOne({
      ambulance: ambulance._id,
      status: {
        $nin: [
          "handed_off",
          "cancelled",
        ],
      },
    });

    console.log(
      "[GPS] Ambulance:",
      ambulance.vehicleNumber
    );

    console.log(
      "[GPS] Active trip found:",
      trip?._id || "NONE"
    );

    console.log(
      "[GPS] Trip status:",
      trip?.status || "NONE"
    );

    /*
     * ==========================
     * PATIENT
     * ==========================
     */

    if (trip && trip.status !== "offered") {
      const target = trip.status === "en_route_hospital" && trip.hospital
        ? (await prisma.hospital.findUnique({ where: { id: trip.hospital } }))?.location.coordinates
        : trip.pickupLocation.coordinates;
      if (target && ["dispatched", "en_route", "en_route_hospital"].includes(trip.status)) {
        const etaMinutes = Math.ceil(distanceKm([numericLng, numericLat], target) * 2);
        const lastEta = trip.events.findLast(row => row.type === "journey:eta_updated");
        const significant = Math.abs(etaMinutes - (lastEta?.payload?.etaMinutes ?? trip.etaMinutes ?? etaMinutes)) >= 5 &&
          (!lastEta || Date.now() - new Date(lastEta.at) >= 30_000);
        await prisma.trip.updateMany({
          where: { id: trip._id, version: trip._version },
          data: { etaMinutes, version: { increment: 1 }, ...(significant ? { events: [...trip.events, {
            _id: require("node:crypto").randomUUID(), type: "journey:eta_updated", at: new Date().toISOString(), payload: { etaMinutes },
          }] } : {}) },
        });
      }
      io?.to(`trip:${trip._id}`).emit(
        "trip:location",
        {
          tripId: trip._id,
          lng: numericLng,
          lat: numericLat,
          heading,
        }
      );
    }

    return res.json({
      ambulance,
    });
  } catch (err) {
    console.error(
      "[dispatch] GPS error:",
      err
    );

    return res.status(err.status || (["P2002", "P2003", "P2004"].includes(err.code) ? 409 : 500)).json({
      message: "Could not update GPS",
    });
  }
}

/*
 * ==========================
 * TRIP STATUS
 * ==========================
 */

async function updateTripStatus(
  req,
  res
) {
  try {
    let releaseAmbulance = false;
    res.once("finish", () => { if (res.statusCode < 300) kickOrchestration(req.app.get("io")); });
    const {
      status,
      hospital,
    } = req.body;

    /*
     * ==========================
     * FIND TRIP
     * ==========================
     */

    const trip =
      await Trip.findById(
        req.params.id
      );

    if (!trip) {
      return res.status(404).json({
        message: "Trip not found",
      });
    }

    /*
     * ==========================
     * PATIENT SECURITY
     * ==========================
     */

    if (
      req.user.role === "patient" &&
      String(trip.patient) !==
        String(req.user.sub)
    ) {
      return res.status(403).json({
        message:
          "You can only cancel your own trip",
      });
    }

    /*
     * ==========================
     * DRIVER SECURITY
     * ==========================
     */

    if (
      req.user.role === "driver"
    ) {
      if (!trip.ambulance) {
        return res.status(403).json({
          message:
            "No ambulance is assigned to this trip",
        });
      }

      const ambulance =
        await Ambulance.findById(
          trip.ambulance
        );

      if (!ambulance) {
        return res.status(404).json({
          message:
            "Assigned ambulance not found",
        });
      }

      if (
        String(ambulance.driver) !==
        String(req.user.sub)
      ) {
        return res.status(403).json({
          message:
            "You can only update your assigned trip",
        });
      }
    }

    const driverTransitions = {
      offered: ["dispatched", "rejected"],
      dispatched: ["en_route"],
      en_route: ["arrived_pickup"],
      arrived_pickup: ["picked_up"],
      picked_up: ["en_route_hospital"],
      en_route_hospital: ["arrived_hospital"],
    };
    const role = req.user.role;
    const terminal = ["cancelled", "handed_off"].includes(trip.status);
    const receivingAccount = role === "hospital" ? await User.findById(req.user.sub) : null;
    const allowed = (role === "driver" && driverTransitions[trip.status]?.includes(status)) ||
      (["patient", "dispatcher", "admin"].includes(role) && !terminal && status === "cancelled") ||
      (role === "hospital" && receivingAccount?.hospital && receivingAccount.hospital === trip.hospital &&
        trip.status === "arrived_hospital" && status === "handed_off");
    if (!allowed || hospital !== undefined) return res.status(403).json({ message: "Transition is not authorized" });
    if (status === "en_route_hospital" && (!trip.hospital ||
      !(await prisma.hospital.findUnique({ where: { id: trip.hospital } }))?.receivingReady)) {
      return res.status(409).json({ message: "A confirmed destination is required" });
    }
    if (status === "rejected") {
      const vehicleId = trip.ambulance;
      trip.ambulance = null;
      trip.status = "requested";
      trip.autoDispatchAt = new Date();
      trip.events.push({ type: "ambulance:rejected", actorId: req.user.sub, at: new Date(), payload: { vehicleId } });
      await require("../data/repository").transaction(async () => {
        await trip.save();
        await Ambulance.findByIdAndUpdate(vehicleId, { status: "idle" });
      });
      const io = req.app.get("io");
      io?.in(`driver:${req.user.sub}`).socketsLeave(`trip:${trip._id}`);
      io?.to("dispatcher").to(`trip:${trip._id}`).emit("case:refresh", { tripId: trip._id });
      return res.json({ trip });
    }
    if (status === "dispatched") {
      trip.autoDispatchAt = null;
      trip.dispatchedAt = new Date();
      const vehicle = await Ambulance.findById(trip.ambulance);
      trip.etaMinutes = Math.ceil(distanceKm(vehicle.location.coordinates, trip.pickupLocation.coordinates) * 2);
    }
    if (["arrived_pickup", "picked_up", "arrived_hospital", "handed_off"].includes(status)) trip.etaMinutes = null;
    if (status === "en_route_hospital") {
      const [vehicle, destination] = await Promise.all([
        prisma.ambulance.findUnique({ where: { id: trip.ambulance } }),
        prisma.hospital.findUnique({ where: { id: trip.hospital } }),
      ]);
      trip.etaMinutes = Math.ceil(distanceKm(vehicle.location.coordinates, destination.location.coordinates) * 2);
    }

    /*
     * ==========================
     * CANCEL
     * ==========================
     */

    if (status === "cancelled") {
      const driverId = trip.ambulance && (await Ambulance.findById(trip.ambulance))?.driver;
      const wasOffered = trip.status === "offered";
      trip.status = "cancelled";
      trip.etaMinutes = null;

      /*
       * Release ambulance and driver.
       */

      if (trip.ambulance) {
        releaseAmbulance = true;
      }

      trip.events.push({
        type: "status:cancelled",
        actorId: req.user.sub,
        at: new Date(),
      });

      await require("../data/repository").transaction(async () => {
        if (releaseAmbulance) await Ambulance.findByIdAndUpdate(trip.ambulance, {status:"idle"});
        if (wasOffered) trip.ambulance = null;
        await trip.save();
        const db = require("../data/repository").client();
        const reservations = await db.hospitalReferral.findMany({
          where: { tripId: trip._id, status: { in: ["accepted", "confirmed"] } },
        });
        for (const reservation of reservations) {
          await db.hospital.update({ where: { id: reservation.hospitalId }, data: { bedsAvailable: { increment: 1 }, version: { increment: 1 } } });
        }
        await db.hospitalReferral.updateMany({
          where: { tripId: trip._id, status: { in: ["proposed", "accepted", "confirmed"] } }, data: { status: "cancelled" },
        });
      });

      /*
       * Populate before returning.
       */

      await trip.populate([
        {
          path: "patient",
          select: "name phone email",
        },
        {
          path: "hospital",
          select: "name address phone",
        },
        {
          path: "ambulance",
          populate: {
            path: "driver",
            select: "name email phone",
          },
        },
      ]);

      const io = req.app.get("io");
      if (driverId) {
        io?.in(`driver:${driverId}`).socketsLeave(`trip:${trip._id}`);
        io?.to(`driver:${driverId}`).emit("case:refresh", { tripId: trip._id });
      }

      /*
       * Patient
       */

      io?.to(`trip:${trip._id}`).emit(
        "trip:status",
        {
          tripId: trip._id,
          status: "cancelled",
          trip,
        }
      );

      /*
       * Dispatcher
       */

      io?.to("dispatcher").emit(
        "trip:status",
        {
          tripId: trip._id,
          status: "cancelled",
          trip,
        }
      );

      return res.json({
        trip,
      });
    }

    /*
     * ==========================
     * NORMAL STATUS
     * ==========================
     */

    const completingDriverId = status === "handed_off" && trip.ambulance && (await Ambulance.findById(trip.ambulance))?.driver;
    trip.status = status;

    /*
     * Update hospital if provided.
     */


    /*
     * ==========================
     * ARRIVED PICKUP
     * ==========================
     */

    if (
      status === "arrived_pickup"
    ) {
      trip.arrivedPickupAt =
        new Date();
    }

    /*
     * ==========================
     * HANDED OFF
     * ==========================
     */

    if (
      status === "handed_off"
    ) {
      trip.handedOffAt =
        new Date();

      /*
       * Release ambulance and driver.
       */

      if (trip.ambulance) {
        releaseAmbulance = true;
      }
    }

    /*
     * ==========================
     * EVENT LOG
     * ==========================
     */

    trip.events.push({
      type: `status:${status}`,
      actorId: req.user.sub,
      at: new Date(),
    });

    await require("../data/repository").transaction(async () => {
        if (releaseAmbulance) await Ambulance.findByIdAndUpdate(trip.ambulance, {status:"idle"});
        await trip.save();
      });

    /*
     * ==========================
     * POPULATE UPDATED TRIP
     * ==========================
     *
     * This is important for:
     *
     * Start trip
     * Arrived pickup
     * Hospital journey
     * Handoff
     *
     * The frontend receives the patient,
     * hospital and driver information
     * together with the updated status.
     */

    await trip.populate([
      {
        path: "patient",
        select: "name phone email",
      },
      {
        path: "hospital",
        select: "name address phone",
      },
      {
        path: "ambulance",
        populate: {
          path: "driver",
          select: "name email phone",
        },
      },
    ]);

    const io = req.app.get("io");
    if (completingDriverId) {
      io?.in(`driver:${completingDriverId}`).socketsLeave(`trip:${trip._id}`);
      io?.to(`driver:${completingDriverId}`).emit("case:refresh", { tripId: trip._id });
    }

    /*
     * ==========================
     * PATIENT
     * ==========================
     */

    io?.to(`trip:${trip._id}`).emit(
      "trip:status",
      {
        tripId: trip._id,
        status,
        trip,
      }
    );

    /*
     * ==========================
     * DISPATCHER
     * ==========================
     */

    io?.to("dispatcher").emit(
      "trip:status",
      {
        tripId: trip._id,
        status,
        trip,
      }
    );

    /*
     * ==========================
     * HOSPITAL
     * ==========================
     */

    if (trip.hospital) {
      io?.to(
        `hospital:${trip.hospital._id || trip.hospital}`
      ).emit(
        "hospital:pre_alert",
        {
          trip,
        }
      );
    }

    /*
     * ==========================
     * RESPONSE
     * ==========================
     */

    return res.json({
      trip,
    });
  } catch (err) {
    console.error(
      "[dispatch] status error:",
      err
    );

    return res.status(err.status || (["P2002", "P2003", "P2004"].includes(err.code) ? 409 : 500)).json({
      message:
        "Could not update trip status",
    });
  }
}

/*
 * ==========================
 * EXPORTS
 * ==========================
 */

module.exports = {
  fleet,
  drivers,
  activeTrips,
  assignAmbulance,
  driverActiveTrip,
  tripContacts,
  updateAmbulanceLocation,
  updateTripStatus,
};