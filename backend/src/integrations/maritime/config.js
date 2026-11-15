const number = (env, key, fallback, min, max) => {
  const value = env[key] === undefined ? fallback : Number(env[key]);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid ${key}`);
  return value;
};
function config(env = process.env) {
  const base = env.MARITIME_API_BASE_URL || "https://api.maritime.sh";
  const url = new URL(base);
  if (url.username || url.password || url.search || url.hash ||
    (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)))) throw new Error("Invalid MARITIME_API_BASE_URL");
  return {
    enabled: env.MARITIME_ENABLED === "true", apiKey: env.MARITIME_API_KEY || "", agentId: env.MARITIME_AGENT_ID || "", base: base.replace(/\/$/, ""),
    timeoutMs: number(env,"MARITIME_TIMEOUT_MS",15000,100,25000), rpm: number(env,"MARITIME_REQUESTS_PER_MINUTE",6,1,120),
    pollMs: number(env,"MARITIME_POLL_MS",5000,100,60000), maxAttempts: number(env,"MARITIME_MAX_ATTEMPTS",5,1,10),
    offerMs: number(env,"RESCUE_OFFER_TIMEOUT_MS",120000,1000,3600000), rejectionCount: number(env,"RESCUE_REJECTION_COUNT",3,2,20),
    rejectionWindowMs: number(env,"RESCUE_REJECTION_WINDOW_MS",300000,1000,3600000),
    referralMs: number(env,"RESCUE_REFERRAL_TIMEOUT_MS",120000,1000,3600000), etaMinutes: number(env,"RESCUE_ETA_INCREASE_MINUTES",5,1,120),
    gpsMs: number(env,"RESCUE_GPS_STALE_MS",90000,1000,3600000), handoffMs: number(env,"RESCUE_HANDOFF_DELAY_MS",300000,1000,3600000),
    simulation: env.NODE_ENV !== "production" && env.RESCUE_SIMULATION_CONTROLS === "true",
  };
}
module.exports = { config };
