import FleetMap from "./FleetMap";
import { useEffect, useRef } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

let mapsLoaderConfigured = false;

function GoogleMapWithKey({
  center = { lat: 25.5941, lng: 85.1376 },
  zoom = 12,
  markers = [],
  ambulances = [],
  trips = [],
}) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markerInstances = useRef(new Map());
  const hasAutoCentered = useRef(false);

  /*
   * ============================
   * COMBINE ALL MAP DATA
   * ============================
   *
   * Patient TripTrack sends markers
   * directly through the markers prop.
   *
   * Dispatcher sends trips + ambulances.
   *
   * We support BOTH.
   */
  const combinedMarkers = [
    // --------------------------------
    // DIRECT MARKERS
    // Patient TripTrack
    // --------------------------------
    ...markers
      .filter(
        (marker) =>
          Number.isFinite(Number(marker.lat)) &&
          Number.isFinite(Number(marker.lng))
      )
      .map((marker) => ({
        ...marker,
        lat: Number(marker.lat),
        lng: Number(marker.lng),
      })),

    // --------------------------------
    // PATIENT MARKERS
    // Dispatcher trips
    // --------------------------------
    ...trips
      .filter((trip) => {
        const coordinates =
          trip.pickupLocation?.coordinates;

        return (
          Array.isArray(coordinates) &&
          coordinates.length === 2 &&
          Number.isFinite(Number(coordinates[0])) &&
          Number.isFinite(Number(coordinates[1]))
        );
      })
      .map((trip) => ({
        id: `patient-${trip._id}`,
        title: `Patient - ${
          trip.patient?.name || "Emergency"
        }`,
        label:
          trip.triage?.urgencyTier ||
          "Emergency",
        status: "patient",

        lat: Number(
          trip.pickupLocation.coordinates[1]
        ),

        lng: Number(
          trip.pickupLocation.coordinates[0]
        ),
      })),

    // --------------------------------
    // AMBULANCE MARKERS
    // Dispatcher fleet
    // --------------------------------
    ...ambulances
      .filter((ambulance) => {
        const coordinates =
          ambulance.location?.coordinates;

        return (
          Array.isArray(coordinates) &&
          coordinates.length === 2 &&
          Number.isFinite(Number(coordinates[0])) &&
          Number.isFinite(Number(coordinates[1])) &&
          !(
            Number(coordinates[0]) === 0 &&
            Number(coordinates[1]) === 0
          )
        );
      })
      .map((ambulance) => ({
        id: `ambulance-${ambulance._id}`,

        title:
          `Ambulance ${
            ambulance.vehicleNumber ||
            "Unknown"
          }`,

        label:
          ambulance.tier ||
          ambulance.status ||
          "Ambulance",

        status:
          ambulance.status || "idle",

        lat: Number(
          ambulance.location.coordinates[1]
        ),

        lng: Number(
          ambulance.location.coordinates[0]
        ),
      })),
  ];

  /*
   * ============================
   * INITIALIZE MAP
   * ============================
   */
  useEffect(() => {
    let cancelled = false;

    async function initializeMap() {
      const apiKey =
        import.meta.env.VITE_MAPS_API_KEY;

      if (!apiKey) {
        console.error(
          "Google Maps API key is missing."
        );
        return;
      }

      try {
        if (!mapsLoaderConfigured) {
          setOptions({
            key: apiKey,
            v: "weekly",
          });

          mapsLoaderConfigured = true;
        }

        const { Map } =
          await importLibrary("maps");

        const {
          AdvancedMarkerElement,
        } = await importLibrary("marker");

        if (
          cancelled ||
          !mapRef.current
        ) {
          return;
        }

        const map = new Map(
          mapRef.current,
          {
            center,
            zoom,

            mapId: "DEMO_MAP_ID",

            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: true,
          }
        );

        mapInstance.current = map;

        map.__AdvancedMarkerElement =
          AdvancedMarkerElement;

        updateMarkers(
          map,
          AdvancedMarkerElement,
          combinedMarkers
        );
      } catch (error) {
        console.error(
          "Google Maps initialization failed:",
          error
        );
      }
    }

    initializeMap();

    return () => {
      cancelled = true;

      markerInstances.current.forEach(
        (marker) => {
          marker.map = null;
        }
      );

      markerInstances.current.clear();

      mapInstance.current = null;
    };
  }, []);

  /*
   * ============================
   * UPDATE MARKERS
   * ============================
   */
  useEffect(() => {
    if (!mapInstance.current) {
      return;
    }

    const AdvancedMarkerElement =
      mapInstance.current
        .__AdvancedMarkerElement;

    if (!AdvancedMarkerElement) {
      return;
    }

    updateMarkers(
      mapInstance.current,
      AdvancedMarkerElement,
      combinedMarkers
    );

    /*
     * Auto-center once on all markers.
     */
    if (
      combinedMarkers.length > 0 &&
      !hasAutoCentered.current
    ) {
      if (combinedMarkers.length === 1) {
        mapInstance.current.setCenter({
          lat: Number(
            combinedMarkers[0].lat
          ),
          lng: Number(
            combinedMarkers[0].lng
          ),
        });

        mapInstance.current.setZoom(15);
      } else {
        const bounds =
          new google.maps.LatLngBounds();

        combinedMarkers.forEach(
          (marker) => {
            bounds.extend({
              lat: Number(marker.lat),
              lng: Number(marker.lng),
            });
          }
        );

        mapInstance.current.fitBounds(
          bounds,
          80
        );
      }

      hasAutoCentered.current = true;
    }
  }, [markers, ambulances, trips]);

  /*
   * ============================
   * UPDATE / CREATE MARKERS
   * ============================
   */
  function updateMarkers(
    map,
    AdvancedMarkerElement,
    markerData
  ) {
    const activeIds = new Set();

    /*
     * Find patient markers.
     *
     * This is used only for
     * anti-overlap positioning.
     */
    const patients =
      markerData.filter(
        (item) =>
          item.status === "patient"
      );

    markerData.forEach(
      (item, index) => {
        const id =
          item.id ||
          `${item.title}-${index}`;

        activeIds.add(id);

        const isPatient =
          item.status === "patient";

        const isAmbulance =
          !isPatient;

        let displayLat =
          Number(item.lat);

        let displayLng =
          Number(item.lng);

        /*
         * ============================
         * ANTI-OVERLAP
         * ============================
         *
         * Only visually separate an
         * ambulance if it is extremely
         * close to a patient.
         *
         * REAL GPS remains unchanged.
         */
        if (
          isAmbulance &&
          patients.length > 0
        ) {
          let nearestPatient = null;
          let nearestDistance =
            Infinity;

          patients.forEach(
            (patient) => {
              const distance =
                calculateDistance(
                  Number(patient.lat),
                  Number(patient.lng),
                  Number(item.lat),
                  Number(item.lng)
                );

              if (
                distance <
                nearestDistance
              ) {
                nearestDistance =
                  distance;

                nearestPatient =
                  patient;
              }
            }
          );

          if (
            nearestPatient &&
            nearestDistance < 50
          ) {
            const offset =
              calculateVisualOffset(
                Number(
                  nearestPatient.lat
                ),
                Number(
                  nearestPatient.lng
                )
              );

            displayLat +=
              offset.lat;

            displayLng +=
              offset.lng;
          }
        }

        /*
         * ============================
         * MARKER CONTENT
         * ============================
         */
        const content =
          isPatient
            ? createPatientMarker(
                item
              )
            : createAmbulanceMarker(
                item
              );

        let marker =
          markerInstances.current.get(
            id
          );

        /*
         * ============================
         * CREATE
         * ============================
         */
        if (!marker) {
          marker =
            new AdvancedMarkerElement({
              map,

              position: {
                lat: displayLat,
                lng: displayLng,
              },

              title:
                item.title ||
                "Marker",

              content,

              zIndex: isPatient
                ? 100
                : 90,
            });

          /*
           * Marker click.
           */
          marker.addListener(
            "click",
            () => {
              map.panTo({
                lat: Number(
                  item.lat
                ),
                lng: Number(
                  item.lng
                ),
              });

              map.setZoom(17);
            }
          );

          markerInstances.current.set(
            id,
            marker
          );
        } else {
          /*
           * ============================
           * UPDATE
           * ============================
           */
          marker.position = {
            lat: displayLat,
            lng: displayLng,
          };

          marker.content = content;

          marker.title =
            item.title ||
            "Marker";

          marker.zIndex = isPatient
            ? 100
            : 90;
        }
      }
    );

    /*
     * ============================
     * REMOVE OLD MARKERS
     * ============================
     */
    markerInstances.current.forEach(
      (marker, id) => {
        if (!activeIds.has(id)) {
          marker.map = null;

          markerInstances.current.delete(
            id
          );
        }
      }
    );
  }

  /*
   * ============================
   * DISTANCE
   * ============================
   */
  function calculateDistance(
    lat1,
    lng1,
    lat2,
    lng2
  ) {
    const earthRadius =
      6371000;

    const dLat =
      toRadians(
        lat2 - lat1
      );

    const dLng =
      toRadians(
        lng2 - lng1
      );

    const a =
      Math.sin(dLat / 2) *
        Math.sin(dLat / 2) +
      Math.cos(
        toRadians(lat1)
      ) *
        Math.cos(
          toRadians(lat2)
        ) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c =
      2 *
      Math.atan2(
        Math.sqrt(a),
        Math.sqrt(1 - a)
      );

    return (
      earthRadius * c
    );
  }

  function toRadians(
    degrees
  ) {
    return (
      (degrees * Math.PI) /
      180
    );
  }

  /*
   * ============================
   * VISUAL OFFSET
   * ============================
   */
  function calculateVisualOffset(
    lat,
    lng
  ) {
    const offsetMeters =
      35;

    const latOffset =
      offsetMeters / 111320;

    const lngOffset =
      offsetMeters /
      (111320 *
        Math.cos(
          toRadians(lat)
        ));

    return {
      lat: latOffset,
      lng: lngOffset,
    };
  }

  /*
   * ============================
   * PATIENT MARKER
   * ============================
   */
  function createPatientMarker(
    item
  ) {
    const container =
      document.createElement(
        "div"
      );

    container.innerHTML = `
      <div
        style="
          position: relative;
          width: 46px;
          height: 56px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          filter:
            drop-shadow(
              0 3px 5px
              rgba(0,0,0,0.35)
            );
        "
        title="${escapeHtml(
          item.title ||
            "Patient pickup"
        )}"
      >

        <div
          style="
            position: absolute;
            top: 0;
            left: 6px;
            width: 34px;
            height: 34px;
            background: #2563eb;
            border: 3px solid white;
            border-radius:
              50% 50% 50% 0;
            transform:
              rotate(-45deg);
          "
        ></div>

        <div
          style="
            position: absolute;
            top: 11px;
            left: 17px;
            width: 12px;
            height: 12px;
            background: white;
            border-radius: 50%;
          "
        ></div>

        <div
          style="
            position: absolute;
            top: 37px;
            left: 50%;
            transform:
              translateX(-50%);
            white-space: nowrap;
            background: white;
            padding: 2px 6px;
            border-radius: 5px;
            font-size: 10px;
            font-weight: 700;
            color: #0f172a;
            box-shadow:
              0 1px 5px
              rgba(0,0,0,0.2);
          "
        >
          PICKUP
        </div>

      </div>
    `;

    const pin =
      container.firstElementChild;

    pin.addEventListener(
      "mouseenter",
      () => {
        pin.style.transform =
          "scale(1.1)";
      }
    );

    pin.addEventListener(
      "mouseleave",
      () => {
        pin.style.transform =
          "scale(1)";
      }
    );

    return container;
  }

  /*
   * ============================
   * AMBULANCE MARKER
   * ============================
   */
  function createAmbulanceMarker(
    item
  ) {
    const container =
      document.createElement(
        "div"
      );

    const status =
      item.status ||
      "idle";

    let background =
      "#16a34a";

    if (
      status ===
        "dispatched" ||
      status ===
        "matched"
    ) {
      background =
        "#f97316";
    }

    if (
      status ===
        "en_route" ||
      status ===
        "en route"
    ) {
      background =
        "#0f172a";
    }

    if (
      status === "stale" ||
      status === "offline"
    ) {
      background =
        "#dc2626";
    }

    container.innerHTML = `
      <div
        style="
          width: 50px;
          height: 50px;
          border-radius: 50%;
          background: ${background};
          border: 3px solid white;

          box-shadow:
            0 3px 12px
            rgba(0,0,0,0.35);

          display: flex;
          align-items: center;
          justify-content: center;

          font-size: 25px;
          cursor: pointer;

          transition:
            transform 0.15s ease;

          position: relative;
        "
        title="${escapeHtml(
          item.title ||
            "Ambulance"
        )}"
      >

        🚑

        <div
          style="
            position: absolute;
            top: 48px;
            left: 50%;
            transform:
              translateX(-50%);

            white-space: nowrap;

            background: white;
            padding: 2px 6px;
            border-radius: 5px;

            font-size: 10px;
            font-weight: 700;

            color: #0f172a;

            box-shadow:
              0 1px 5px
              rgba(0,0,0,0.2);
          "
        >
          ${escapeHtml(
            item.title ||
              "Ambulance"
          )}
        </div>

      </div>
    `;

    const icon =
      container.firstElementChild;

    icon.addEventListener(
      "mouseenter",
      () => {
        icon.style.transform =
          "scale(1.15)";
      }
    );

    icon.addEventListener(
      "mouseleave",
      () => {
        icon.style.transform =
          "scale(1)";
      }
    );

    return container;
  }

  /*
   * Prevent marker title text
   * from breaking HTML.
   */
  function escapeHtml(
    value
  ) {
    return String(value)
      .replace(
        /&/g,
        "&amp;"
      )
      .replace(
        /</g,
        "&lt;"
      )
      .replace(
        />/g,
        "&gt;"
      )
      .replace(
        /"/g,
        "&quot;"
      )
      .replace(
        /'/g,
        "&#039;"
      );
  }

  /*
   * ============================
   * MAP
   * ============================
   */
  return (
    <div
      ref={mapRef}
      style={{
        width: "100%",
        height: "100%",
        minHeight: "400px",
        borderRadius: "16px",
        overflow: "hidden",
      }}
    />
  );
}
export default function GoogleMap(props) {
 return import.meta.env.VITE_MAPS_API_KEY ? <GoogleMapWithKey {...props}/> : <FleetMap {...props}/>;
}
