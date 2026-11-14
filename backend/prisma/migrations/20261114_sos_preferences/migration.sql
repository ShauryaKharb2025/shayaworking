ALTER TABLE "Trip" ADD COLUMN "symptoms" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], ADD COLUMN "requestedAmbulanceTier" TEXT;
ALTER TABLE "Trip" ADD CONSTRAINT "requested_ambulance_tier" CHECK ("requestedAmbulanceTier" IS NULL OR "requestedAmbulanceTier" IN ('ALS','BLS'));
