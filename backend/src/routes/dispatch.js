const router = require("express").Router();

const {
  requireAuth,
  requireRole,
} = require("../middleware/auth");

const {
  fleet,
  drivers,
  activeTrips,
  assignAmbulance,
  driverActiveTrip,
  tripContacts,
  updateAmbulanceLocation,
  updateTripStatus,
} = require("../controllers/dispatchController");

/*
 * ==========================
 * DISPATCHER FLEET
 * ==========================
 */

router.get(
  "/fleet",
  requireAuth,
  requireRole("dispatcher", "admin"),
  fleet
);
router.get(
  "/drivers",
  requireAuth,
  requireRole("dispatcher", "admin"),
  drivers
);

/*
 * ==========================
 * ACTIVE TRIPS
 * ==========================
 */

router.get(
  "/trips",
  requireAuth,
  requireRole("dispatcher", "admin"),
  activeTrips
);

/*
 * ==========================
 * DRIVER ACTIVE TRIP
 * ==========================
 */

router.get(
  "/driver-trip",
  requireAuth,
  requireRole("driver"),
  driverActiveTrip
);

/*
 * ==========================
 * TRIP CONTACTS
 * ==========================
 *
 * Patient and assigned driver
 * can access this.
 */

router.get(
  "/trip/:id/contacts",
  requireAuth,
  requireRole(
    "patient",
    "caregiver",
    "driver"
  ),
  tripContacts
);

/*
 * ==========================
 * ASSIGN AMBULANCE
 * ==========================
 */

router.patch(
  "/trip/:id/assign",
  requireAuth,
  requireRole(
    "dispatcher",
    "admin"
  ),
  assignAmbulance
);

/*
 * ==========================
 * GPS
 * ==========================
 */

router.post(
  "/ambulance/:id/location",
  requireAuth,
  requireRole(
    "driver",
    "dispatcher",
    "admin",
    "operator"
  ),
  updateAmbulanceLocation
);

/*
 * ==========================
 * TRIP STATUS
 * ==========================
 */

router.patch(
  "/trip/:id/status",
  requireAuth,
  requireRole(
    "patient",
    "dispatcher",
    "driver",
    "hospital",
    "admin"
  ),
  updateTripStatus
);

module.exports = router;