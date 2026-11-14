function distanceKm([lng, lat], [targetLng, targetLat]) {
  const radians = Math.PI / 180;
  const a = Math.sin((targetLat - lat) * radians / 2) ** 2 +
    Math.cos(lat * radians) * Math.cos(targetLat * radians) *
    Math.sin((targetLng - lng) * radians / 2) ** 2;
  return Math.round(12742 * Math.asin(Math.sqrt(Math.min(1, a))) * 10) / 10;
}

function ambulanceCandidates(trip, fleet) {
  const tier = trip.triage?.suggestedAmbulanceTier === "ALS" || trip.requestedAmbulanceTier === "ALS" ? "ALS" : "BLS";
  const equipment = Array.isArray(trip.triage?.suggestedEquipment) ? trip.triage.suggestedEquipment : [];
  return fleet.map(vehicle => {
    const reasons = [];
    if (vehicle.status !== "idle") reasons.push("Vehicle unavailable");
    if (!vehicle.complianceVerified || !vehicle.operator?.verified) reasons.push("Compliance unverified");
    if (!vehicle.crew?.some(member => member.certified === true)) reasons.push("Certified crew not recorded");
    if (tier === "ALS" && vehicle.tier !== "ALS") reasons.push("ALS required");
    const inventory = new Set(vehicle.equipment.map(item => item.toLowerCase()));
    if (equipment.some(item => !inventory.has(String(item).toLowerCase()))) reasons.push("Required equipment missing");
    return {
      id: vehicle.id || vehicle._id,
      label: vehicle.vehicleNumber,
      tier: vehicle.tier,
      eligible: reasons.length === 0,
      reasons,
      distanceKm: distanceKm(trip.pickupLocation.coordinates, vehicle.location.coordinates),
    };
  }).sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.distanceKm - b.distanceKm || a.id.localeCompare(b.id));
}

function hospitalCandidates(trip, hospitals) {
  return hospitals.map(hospital => ({
    id: hospital.id,
    label: hospital.name,
    specialties: hospital.specialties,
    bedsAvailable: hospital.bedsAvailable,
    eligible: hospital.receivingReady && hospital.bedsAvailable > 0,
    distanceKm: distanceKm(trip.ambulance?.location?.coordinates || trip.pickupLocation.coordinates, hospital.location.coordinates),
  })).sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.distanceKm - b.distanceKm || a.id.localeCompare(b.id));
}

module.exports = { ambulanceCandidates, hospitalCandidates, distanceKm };
