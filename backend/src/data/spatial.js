const prisma = require("./prisma");
let supported;
async function hasPostgis() {
  if (supported === undefined) {
    const rows = await prisma.$queryRaw`SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='postgis') AS enabled`;
    supported = rows[0].enabled;
  }
  return supported;
}
async function coverageAt(lng, lat) {
  if (!await hasPostgis()) return undefined;
  const rows = await prisma.$queryRaw`
    SELECT "status" FROM "CoverageZone"
    WHERE "status" IN ('live','limited')
    AND ST_DWithin(
      ST_SetSRID(ST_MakePoint(("center"->'coordinates'->>0)::double precision, ("center"->'coordinates'->>1)::double precision),4326)::geography,
      ST_SetSRID(ST_MakePoint(${lng}::double precision,${lat}::double precision),4326)::geography,
      "radiusKm" * 1000)
    ORDER BY "name" LIMIT 1`;
  return rows[0]?.status || "coming_soon";
}
module.exports = { coverageAt, hasPostgis };
