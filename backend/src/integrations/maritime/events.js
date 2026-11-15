const { createHash } = require("node:crypto");
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const terminal = status => ["handed_off","cancelled","waitlisted"].includes(status);
const latest = (trip, type) => trip.events.findLast(event => event.type === type);
function signals(trip, cfg, now = Date.now()) {
  if (terminal(trip.status)) return [];
  const result = [], events = trip.events || [];
  const add = (category, anchor, facts) => result.push({category,anchor:String(anchor),facts,
    key:digest([trip.id,category,anchor,trip.ambulanceId,trip.hospitalId,trip.status]), context:digest([trip.ambulanceId,trip.hospitalId,trip.status,category,anchor])});
  const offered = [...events].reverse().find(e => ["ambulance:auto_offered","ambulance:offered","ambulance:replacement_approved"].includes(e.type));
  const offeredAt = new Date(offered?.at || trip.createdAt).getTime();
  const deadline = Math.min(trip.autoDispatchAt ? new Date(trip.autoDispatchAt).getTime() : Infinity, offeredAt + cfg.offerMs);
  const expired = latest(trip,"ambulance:offer_expired");
  if (trip.status === "offered" && now >= deadline) add("AMBULANCE_OFFER_TIMEOUT",offered?._id || offeredAt,{deadline:new Date(deadline).toISOString()});
  else if (trip.status === "requested" && expired && (!offered || new Date(expired.at).getTime() >= offeredAt)) add("AMBULANCE_OFFER_TIMEOUT",expired._id,{expiredAt:expired.at});
  const rejections = events.filter(e => e.type === "ambulance:rejected" && now-new Date(e.at).getTime() <= cfg.rejectionWindowMs);
  if (trip.status === "requested" && rejections.length >= cfg.rejectionCount) add("AMBULANCE_REJECTION_CASCADE",rejections.at(-1)._id,{rejectionCount:rejections.length});
  const referral = [...(trip.referrals || [])].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))[0];
  if (!trip.hospitalId && referral && (referral.status === "rejected" || ["proposed","withdrawn"].includes(referral.status) && now-new Date(referral.createdAt).getTime() >= cfg.referralMs)) add("HOSPITAL_REFERRAL_FAILURE",referral.id,{referralStatus:referral.status,createdAt:new Date(referral.createdAt).toISOString()});
  if (["en_route","en_route_hospital"].includes(trip.status)) {
    const phase = latest(trip,"status:"+trip.status);
    const baseline = events.find(e=>e.type==="rescue:eta_baseline" && e.payload?.phase===phase?._id);
    if (baseline && Number.isFinite(trip.etaMinutes) && trip.etaMinutes-baseline.payload.etaMinutes >= cfg.etaMinutes) add("ETA_DETERIORATION",baseline._id,{baselineMinutes:baseline.payload.etaMinutes,currentMinutes:trip.etaMinutes});
    const ping = trip.ambulance?.lastPingAt || phase?.at || trip.dispatchedAt || trip.createdAt;
    if (now-new Date(ping).getTime() >= cfg.gpsMs) add("STALE_AMBULANCE_GPS",new Date(ping).toISOString(),{lastPingAt:new Date(ping).toISOString(),thresholdMs:cfg.gpsMs});
  }
  const arrival = latest(trip,"status:arrived_hospital");
  if (trip.status === "arrived_hospital" && arrival && now-new Date(arrival.at).getTime() >= cfg.handoffMs) add("HANDOFF_DELAY",arrival._id,{arrivedAt:arrival.at,thresholdMs:cfg.handoffMs});
  return result;
}
function envelope(incident, job, trip) {
  return {schemaVersion:1,kind:job.kind,incidentId:incident.id,caseAlias:incident.caseAlias,caseVersion:job.caseVersion,category:incident.category,
    state:trip.status,detectedAt:incident.createdAt.toISOString(),facts:incident.facts,evidence:job.evidence};
}
module.exports = { signals, terminal, digest, envelope };
