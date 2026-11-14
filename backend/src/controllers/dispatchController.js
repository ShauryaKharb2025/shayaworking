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
    }).populate("operator", "name type");

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
      status: {
        $in: [
          "dispatched",
          "en_route",
          "stale",
        ],
      },
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
          "dispatched",
          "en_route",
          "arrived_pickup",
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

    if (!trip) {
      return res.json({
        trip: null,
        ambulance: null,
      });
    }

    return res.json({
      trip,
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

    if (trip.ambulance) {
      return res.status(409).json({
        message:
          "An ambulance is already assigned to this trip",
      });
    }

    /*
     * ==========================
     * FIND AMBULANCE
     * ==========================
     */

    const ambulance =
      await Ambulance.findById(
        ambulanceId
      );

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

    if (ambulance.status !== "idle") {
      return res.status(409).json({
        message:
          "Ambulance is not available",
      });
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
    trip.status = "dispatched";
    trip.dispatchedAt = new Date();

    /*
     * Manual dispatcher assignment
     * cancels the automatic-dispatch timer.
     */

    trip.autoDispatchAt = null;

    /*
     * ==========================
     * EVENT LOG
     * ==========================
     */

    trip.events.push({
      type: "ambulance:assigned",
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

    io?.to(`trip:${trip._id}`).emit(
      "trip:status",
      {
        tripId: trip._id,
        status: "dispatched",
        trip,
        ambulance,
      }
    );

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

    /*
     * ==========================
     * RESPONSE
     * ==========================
     */

    return res.json({
      message:
        "Ambulance and driver assigned successfully",
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

      driver: trip.ambulance?.driver
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
      status,
    } = req.body;

    console.log(
      "[GPS UPDATE]",
      req.params.id,
      lng,
      lat,
      status
    );

    /*
     * ==========================
     * VALIDATE COORDINATES
     * ==========================
     */

    const numericLng = Number(lng);
    const numericLat = Number(lat);

    if (
      !Number.isFinite(numericLng) ||
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

    if (status) {
      ambulance.status = status;
    }

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

    if (trip) {
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

    /*
     * ==========================
     * CANCEL
     * ==========================
     */

    if (
      status === "cancelled"
    ) {
      trip.status = "cancelled";

      /*
       * Release ambulance and driver.
       */

      if (trip.ambulance) {
        releaseAmbulance = true;
      }

      trip.events.push({
        type: "status:cancelled",
        at: new Date(),
      });

      await require("../data/repository").transaction(async () => {
        if (releaseAmbulance) await Ambulance.findByIdAndUpdate(trip.ambulance, {status:"idle",driver:null});
        await trip.save();
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

    trip.status = status;

    /*
     * Update hospital if provided.
     */

    if (hospital) {
      trip.hospital = hospital;
    }

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
      at: new Date(),
    });

    await require("../data/repository").transaction(async () => {
        if (releaseAmbulance) await Ambulance.findByIdAndUpdate(trip.ambulance, {status:"idle",driver:null});
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