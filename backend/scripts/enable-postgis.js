require("dotenv").config();
const prisma = require("../src/data/prisma");
(async () => {
  await prisma.$executeRawUnsafe("CREATE EXTENSION IF NOT EXISTS postgis");
  for (const [table, field] of [["Ambulance", "location"], ["Hospital", "location"], ["CoverageZone", "center"]]) {
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "${table}_geography_idx" ON "${table}" USING GIST ((ST_SetSRID(ST_MakePoint(("${field}"->'coordinates'->>0)::double precision, ("${field}"->'coordinates'->>1)::double precision),4326)::geography))`);
  }
  console.log("PostGIS enabled; spatial indexes created.");
})().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
