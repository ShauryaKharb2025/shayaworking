CREATE TABLE "JourneyProjection" (
  "tripId" TEXT PRIMARY KEY REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "fingerprint" TEXT NOT NULL,
  "coordination" TEXT NOT NULL,
  "summary" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
