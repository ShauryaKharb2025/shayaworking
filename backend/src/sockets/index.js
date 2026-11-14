const Trip = require("../models/Trip");
const Ambulance = require("../models/Ambulance");
const {
  verifyAccessToken,
} = require("../utils/jwt");

/*
 * ==========================
 * CHECK TRIP ACCESS
 * ==========================
 */

async function canJoinTrip(
  socket,
  tripId
) {
  if (!socket.user) {
    return false;
  }

  const trip =
    await Trip.findById(tripId);

  if (!trip) {
    return false;
  }

  const userId =
    String(socket.user.sub);

  /*
   * Patient / caregiver
   */

  if (
    ["patient", "caregiver"].includes(
      socket.user.role
    ) &&
    String(trip.patient) ===
      userId
  ) {
    return true;
  }

  /*
   * Driver
   */

  if (
    socket.user.role === "driver" &&
    trip.ambulance
  ) {
    const ambulance =
      await Ambulance.findById(
        trip.ambulance
      );

    if (
      ambulance &&
      ambulance.driver &&
      String(ambulance.driver) ===
        userId
    ) {
      return true;
    }
  }

  return false;
}

/*
 * ==========================
 * SOCKET INITIALIZATION
 * ==========================
 */

function initSockets(io) {
  /*
   * ==========================
   * AUTHENTICATION
   * ==========================
   */

  io.use(
    (socket, next) => {
      try {
        const token =
          socket.handshake.auth?.token;

        /*
         * Public users can still
         * connect for coverage map.
         */

        if (!token) {
          socket.user = null;
          return next();
        }

        socket.user =
          verifyAccessToken(token);

        next();
      } catch (err) {
        socket.user = null;
        next();
      }
    }
  );

  /*
   * ==========================
   * CONNECTION
   * ==========================
   */

  io.on(
    "connection",
    (socket) => {
      /*
       * ==========================
       * TRIP ROOM
       * ==========================
       */

      socket.on(
        "join:trip",
        async (tripId) => {
          try {
            const allowed =
              await canJoinTrip(
                socket,
                tripId
              );

            if (!allowed) {
              socket.emit(
                "trip:access_denied"
              );

              return;
            }

            socket.join(
              `trip:${tripId}`
            );

            console.log(
              `[socket] ${
                socket.user?.role
              } joined trip:${tripId}`
            );
          } catch (err) {
            console.error(
              "[socket] join trip error:",
              err
            );
          }
        }
      );

      /*
       * ==========================
       * SEND MESSAGE
       * ==========================
       */

      socket.on(
        "trip:message:send",
        async ({
          tripId,
          text,
        }) => {
          try {
            if (!socket.user) {
              return;
            }

            const cleanText =
              String(
                text || ""
              ).trim();

            if (!cleanText) {
              return;
            }

            if (
              cleanText.length > 500
            ) {
              return;
            }

            const allowed =
              await canJoinTrip(
                socket,
                tripId
              );

            if (!allowed) {
              socket.emit(
                "trip:access_denied"
              );

              return;
            }

            const trip =
              await Trip.findById(
                tripId
              );

            if (!trip) {
              return;
            }

            /*
             * No communication after
             * handoff/cancellation.
             */

            if (
              [
                "handed_off",
                "cancelled",
              ].includes(
                trip.status
              )
            ) {
              return;
            }

            /*
             * Only patient/caregiver/driver
             */

            if (
              ![
                "patient",
                "caregiver",
                "driver",
              ].includes(
                socket.user.role
              )
            ) {
              return;
            }

            const message = {
              sender:
                socket.user.sub,

              senderRole:
                socket.user.role,

              text: cleanText,

              at: new Date(),
            };

            trip.messages.push(
              message
            );

            await trip.save();

            const savedMessage =
              trip.messages[
                trip.messages.length - 1
              ];

            io.to(
              `trip:${tripId}`
            ).emit(
              "trip:message",
              {
                tripId,

                message: {
                  _id:
                    savedMessage._id,

                  sender:
                    savedMessage.sender,

                  senderRole:
                    savedMessage.senderRole,

                  text:
                    savedMessage.text,

                  at:
                    savedMessage.at,
                },
              }
            );
          } catch (err) {
            console.error(
              "[socket] message error:",
              err
            );
          }
        }
      );

      /*
       * ==========================
       * DISPATCHER ROOM
       * ==========================
       */

      socket.on(
        "join:dispatcher",
        () => {
          if (
            socket.user &&
            [
              "dispatcher",
              "admin",
            ].includes(
              socket.user.role
            )
          ) {
            socket.join(
              "dispatcher"
            );
          }
        }
      );

      /*
       * ==========================
       * HOSPITAL ROOM
       * ==========================
       */

      socket.on(
        "join:hospital",
        (hospitalId) => {
          if (
            socket.user &&
            [
              "hospital",
              "admin",
            ].includes(
              socket.user.role
            )
          ) {
            socket.join(
              `hospital:${hospitalId}`
            );
          }
        }
      );

      /*
 * ==========================
 * DRIVER ROOM
 * ==========================
 */

socket.on(
  "join:driver",
  () => {
    if (
      socket.user &&
      socket.user.role === "driver"
    ) {
      socket.join(
        `driver:${socket.user.sub}`
      );

      console.log(
        `[socket] driver joined driver:${socket.user.sub}`
      );
    }
  }
);



      socket.on(
        "disconnect",
        () => {}
      );
    }
  );
}

module.exports = initSockets;
