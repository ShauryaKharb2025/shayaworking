ALTER TABLE "Trip" ADD COLUMN "requestKey" TEXT, ADD COLUMN "requestFingerprint" TEXT;
CREATE UNIQUE INDEX "Trip_patientId_requestKey_key" ON "Trip"("patientId","requestKey");
