const { createHash } = require("node:crypto");

function eventsForJourney(trip, observations = []) {
  return [
    ...trip.events.filter(row => /^(sos:|ambulance:|hospital:|status:|journey:)/.test(row.type))
      .map(row => ({ id: row._id, type: row.type, at: row.at })),
    ...observations.map(row => ({ id: row.id, type: "observation:" + row.type, at: row.createdAt })),
  ].filter(row => row.id).sort((a, b) => new Date(a.at) - new Date(b.at));
}

function fingerprint(events) {
  return createHash("sha256").update(JSON.stringify(events)).digest("hex");
}

module.exports = { eventsForJourney, fingerprint };
