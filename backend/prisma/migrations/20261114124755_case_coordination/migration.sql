ALTER TABLE "Hospital" ADD COLUMN "receivingReady" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "HospitalReferral" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HospitalReferral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaregiverAccess" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "userId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "CaregiverAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalObservation" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "familyVisible" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicalObservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HospitalReferral_tripId_idx" ON "HospitalReferral"("tripId");

-- CreateIndex
CREATE INDEX "HospitalReferral_hospitalId_status_idx" ON "HospitalReferral"("hospitalId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CaregiverAccess_tokenHash_key" ON "CaregiverAccess"("tokenHash");

-- CreateIndex
CREATE INDEX "CaregiverAccess_tripId_userId_idx" ON "CaregiverAccess"("tripId", "userId");

-- CreateIndex
CREATE INDEX "ClinicalObservation_tripId_createdAt_idx" ON "ClinicalObservation"("tripId", "createdAt");

-- AddForeignKey
ALTER TABLE "HospitalReferral" ADD CONSTRAINT "HospitalReferral_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalReferral" ADD CONSTRAINT "HospitalReferral_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaregiverAccess" ADD CONSTRAINT "CaregiverAccess_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalObservation" ADD CONSTRAINT "ClinicalObservation_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "User" DROP CONSTRAINT "user_role",
  ADD CONSTRAINT "user_role" CHECK ("role" IN ('patient','caregiver','driver','hospital','dispatcher','operator','admin','clinician'));
ALTER TABLE "Trip" DROP CONSTRAINT "trip_status",
  ADD CONSTRAINT "trip_status" CHECK ("status" IN ('requested','waitlisted','matched','offered','dispatched','en_route','arrived_pickup','picked_up','en_route_hospital','arrived_hospital','handed_off','cancelled'));
ALTER TABLE "HospitalReferral" ADD CONSTRAINT "hospital_referral_status"
  CHECK ("status" IN ('proposed','accepted','rejected','withdrawn','confirmed','replaced','cancelled'));
CREATE UNIQUE INDEX "one_pending_referral_per_trip" ON "HospitalReferral" ("tripId") WHERE "status" IN ('proposed','accepted');
CREATE UNIQUE INDEX "one_confirmed_referral_per_trip" ON "HospitalReferral" ("tripId") WHERE "status" = 'confirmed';
