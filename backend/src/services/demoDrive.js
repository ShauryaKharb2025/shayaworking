const db = require('../data/prisma');
const { randomUUID } = require('node:crypto');

function positionOnRoute(points, progress) {
  const offset = Math.max(0, Math.min(1, progress)) * (points.length - 1);
  const index = Math.min(Math.floor(offset), points.length - 2);
  return points[index].map((value, axis) => value + (points[index + 1][axis] - value) * (offset - index));
}

async function beginDemoDrive(tripId, driverId, destination = "pickup") {
  if (process.env.NODE_ENV === 'production') throw Object.assign(new Error('Demo drive is disabled in production'), { status: 403 });
  const trip = await db.trip.findUnique({ where: { id: tripId }, include: { ambulance: true, hospital: true } });
  if (!trip || trip.ambulance?.driverId !== driverId) throw Object.assign(new Error('Assigned driver required'), { status: 403 });
  const hospitalLeg = destination === "hospital";
  const eventType = hospitalLeg ? "journey:demo_hospital_drive_started" : "journey:demo_drive_started";
  const travellingStatus = hospitalLeg ? "en_route_hospital" : "en_route";
  const allowed = hospitalLeg ? ["picked_up"] : ["offered","dispatched","en_route"];
  if (!allowed.includes(trip.status) || trip.events.some(row=>row.type===eventType)) throw Object.assign(new Error("Journey is no longer available"), {status:409});
  if (hospitalLeg && !trip.hospital?.receivingReady) throw Object.assign(new Error("A confirmed receiving hospital is required"), {status:409});
  const end = hospitalLeg ? trip.hospital.location.coordinates : trip.pickupLocation.coordinates;
  const angle = Math.random() * Math.PI * 2;
  const latitude = Math.max(-89.99, Math.min(89.99, end[1] + Math.sin(angle) * 0.006));
  const longitude = ((end[0] + Math.cos(angle) * 0.006 / Math.max(0.1, Math.cos(end[1] * Math.PI / 180)) + 540) % 360) - 180;
  const start = hospitalLeg ? trip.ambulance.location.coordinates : [longitude, latitude];
  let coordinates = [start, end];
  let road = false;
  try {
    const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${start.join(',')};${end.join(',')}?overview=full&geometries=geojson`, { signal: AbortSignal.timeout(5000) });
    const result = await response.json();
    if (response.ok && result.routes?.[0]?.geometry?.coordinates?.length > 1) {
      coordinates = [start, ...result.routes[0].geometry.coordinates, end];
      road = true;
    }
  } catch {}
  const at = new Date().toISOString();
  await db.$transaction(async tx => {
    const result = await tx.trip.updateMany({ where: { id: tripId, version: trip.version, status: trip.status }, data: {
      status: travellingStatus, autoDispatchAt: null, dispatchedAt: new Date(), etaMinutes: 1, version: { increment: 1 },
      events: [...trip.events,
        ...(!hospitalLeg ? [{ _id: randomUUID(), type: 'status:dispatched', at, actorId: driverId }] : []),
        { _id: randomUUID(), type: "status:" + travellingStatus, at, actorId: driverId },
        { _id: randomUUID(), type: eventType, at, payload: { coordinates, road, durationMs: 60000, vehicleId: trip.ambulanceId } }],
    } });
    if (!result.count) throw Object.assign(new Error('Offer changed. Refresh and retry'), { status: 409 });
    await tx.ambulance.update({ where: { id: trip.ambulanceId }, data: { status: 'en_route', location: { type: 'Point', coordinates: start }, lastPingAt: new Date(), version: { increment: 1 } } });
  });
}

async function advanceDemoDrives(io) {
  if (process.env.NODE_ENV === 'production') return;
  const trips = await db.trip.findMany({ where: { status: { in: ['en_route','en_route_hospital'] } } });
  for (const trip of trips) {
    const hospitalLeg = trip.status === 'en_route_hospital';
    const arrivalStatus = hospitalLeg ? 'arrived_hospital' : 'arrived_pickup';
    const event = trip.events.findLast(row => row.type === (hospitalLeg ? 'journey:demo_hospital_drive_started' : 'journey:demo_drive_started'));
    if (!event || event.payload.vehicleId !== trip.ambulanceId) continue;
    const progress = Math.min(1, (Date.now() - new Date(event.at).getTime()) / event.payload.durationMs);
    const coordinates = positionOnRoute(event.payload.coordinates, progress);
    const arrived = progress >= 1;
    const changed = await db.$transaction(async tx => {
      const result = await tx.trip.updateMany({ where: { id: trip.id, version: trip.version, status: trip.status }, data: {
        status: arrived ? arrivalStatus : trip.status, etaMinutes: arrived ? null : 1, version: { increment: 1 },
        ...(arrived ? { ...(!hospitalLeg ? { arrivedPickupAt: new Date() } : {}), events: [...trip.events, { _id: randomUUID(), type: "status:" + arrivalStatus, at: new Date().toISOString(), payload: { simulated: true } }] } : {}),
      } });
      if (result.count) await tx.ambulance.update({ where: { id: trip.ambulanceId }, data: { location: { type: 'Point', coordinates }, lastPingAt: new Date(), version: { increment: 1 } } });
      return result.count;
    });
    if (!changed) continue;
    io?.to(`trip:${trip.id}`).emit('trip:location', { tripId: trip.id, lng: coordinates[0], lat: coordinates[1], simulated: true });
    io?.to('dispatcher').to(`trip:${trip.id}`).emit('case:refresh', { tripId: trip.id });
  }
}

module.exports = { beginDemoDrive, advanceDemoDrives, positionOnRoute };
