ALTER TABLE "Trip"
  ADD COLUMN IF NOT EXISTS "symptoms" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "requestedAmbulanceTier" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = '"Trip"'::regclass AND conname = 'requested_ambulance_tier'
  ) THEN
    ALTER TABLE "Trip" ADD CONSTRAINT "requested_ambulance_tier"
      CHECK ("requestedAmbulanceTier" IS NULL OR "requestedAmbulanceTier" IN ('ALS', 'BLS'));
  END IF;
END $$;
