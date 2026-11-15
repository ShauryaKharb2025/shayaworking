CREATE TABLE "HealthReading" (
"id" TEXT NOT NULL, "tripId" TEXT NOT NULL, "actorId" TEXT,
"source" TEXT NOT NULL, "values" JSONB NOT NULL, "measuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
CONSTRAINT "HealthReading_pkey" PRIMARY KEY ("id"),
CONSTRAINT "HealthReading_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE INDEX "HealthReading_tripId_measuredAt_idx" ON "HealthReading"("tripId", "measuredAt");
