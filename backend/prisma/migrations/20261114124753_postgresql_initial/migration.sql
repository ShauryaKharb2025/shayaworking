-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "avatar" TEXT,
    "googleId" TEXT,
    "passwordHash" TEXT,
    "role" TEXT NOT NULL DEFAULT 'patient',
    "phone" TEXT,
    "preferredLanguage" TEXT NOT NULL DEFAULT 'en',
    "operatorId" TEXT,
    "hospitalId" TEXT,
    "caregiverFor" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "medicalProfile" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Operator" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verificationDocs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "city" TEXT,
    "slaMinutes" INTEGER NOT NULL DEFAULT 15,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Operator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ambulance" (
    "id" TEXT NOT NULL,
    "vehicleNumber" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'BLS',
    "equipment" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "crew" JSONB NOT NULL DEFAULT '[]',
    "driverId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'offline',
    "location" JSONB NOT NULL DEFAULT '{"type":"Point","coordinates":[0,0]}',
    "heading" DOUBLE PRECISION,
    "lastPingAt" TIMESTAMP(3),
    "complianceVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Ambulance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hospital" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "location" JSONB NOT NULL DEFAULT '{"type":"Point","coordinates":[0,0]}',
    "specialties" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bedsAvailable" INTEGER NOT NULL DEFAULT 0,
    "erContact" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Hospital_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoverageZone" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pincode" TEXT,
    "center" JSONB NOT NULL DEFAULT '{"type":"Point","coordinates":[0,0]}',
    "radiusKm" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "status" TEXT NOT NULL DEFAULT 'coming_soon',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CoverageZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "triggeredById" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'app',
    "pickupLocation" JSONB NOT NULL,
    "address" TEXT,
    "triage" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'requested',
    "coverageState" TEXT NOT NULL DEFAULT 'live',
    "ambulanceId" TEXT,
    "hospitalId" TEXT,
    "etaMinutes" DOUBLE PRECISION,
    "dispatchedAt" TIMESTAMP(3),
    "autoDispatchAt" TIMESTAMP(3),
    "arrivedPickupAt" TIMESTAMP(3),
    "handedOffAt" TIMESTAMP(3),
    "events" JSONB NOT NULL DEFAULT '[]',
    "messages" JSONB NOT NULL DEFAULT '[]',
    "fallbackChannelUsed" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaitlistEntry" (
    "id" TEXT NOT NULL,
    "pincodeOrArea" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "contactPreference" TEXT NOT NULL DEFAULT 'sms',
    "contact" TEXT NOT NULL,
    "consented" BOOLEAN NOT NULL,
    "location" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "Operator_name_key" ON "Operator"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Ambulance_vehicleNumber_key" ON "Ambulance"("vehicleNumber");

-- CreateIndex
CREATE INDEX "Ambulance_status_idx" ON "Ambulance"("status");

-- CreateIndex
CREATE INDEX "Ambulance_driverId_idx" ON "Ambulance"("driverId");

-- CreateIndex
CREATE UNIQUE INDEX "Hospital_name_key" ON "Hospital"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CoverageZone_name_key" ON "CoverageZone"("name");

-- CreateIndex
CREATE INDEX "Trip_patientId_createdAt_idx" ON "Trip"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "Trip_status_autoDispatchAt_idx" ON "Trip"("status", "autoDispatchAt");

-- CreateIndex
CREATE INDEX "Trip_hospitalId_idx" ON "Trip"("hospitalId");

-- CreateIndex
CREATE INDEX "WaitlistEntry_pincodeOrArea_idx" ON "WaitlistEntry"("pincodeOrArea");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ambulance" ADD CONSTRAINT "Ambulance_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ambulance" ADD CONSTRAINT "Ambulance_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_ambulanceId_fkey" FOREIGN KEY ("ambulanceId") REFERENCES "Ambulance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Database-level constraints protect writes from every API path.
ALTER TABLE "User" ADD CONSTRAINT "user_role" CHECK ("role" IN ('patient','caregiver','driver','hospital','dispatcher','operator','admin'));
ALTER TABLE "Ambulance" ADD CONSTRAINT "ambulance_tier" CHECK ("tier" IN ('ALS','BLS'));
ALTER TABLE "Ambulance" ADD CONSTRAINT "ambulance_status" CHECK ("status" IN ('idle','en_route','dispatched','stale','offline'));
ALTER TABLE "Trip" ADD CONSTRAINT "trip_status" CHECK ("status" IN ('requested','waitlisted','matched','dispatched','en_route','arrived_pickup','en_route_hospital','handed_off','cancelled'));
ALTER TABLE "Trip" ADD CONSTRAINT "trip_channel" CHECK ("channel" IN ('app','ivr','sms','caregiver'));
ALTER TABLE "Hospital" ADD CONSTRAINT "nonnegative_beds" CHECK ("bedsAvailable" >= 0);
ALTER TABLE "CoverageZone" ADD CONSTRAINT "positive_radius" CHECK ("radiusKm" > 0);
ALTER TABLE "CoverageZone" ADD CONSTRAINT "coverage_status" CHECK ("status" IN ('live','limited','onboarding','coming_soon'));
CREATE UNIQUE INDEX "one_active_trip_per_ambulance" ON "Trip" ("ambulanceId")
WHERE "ambulanceId" IS NOT NULL AND "status" NOT IN ('cancelled','handed_off');
CREATE UNIQUE INDEX "one_active_ambulance_per_driver" ON "Ambulance" ("driverId")
WHERE "driverId" IS NOT NULL AND "status" IN ('dispatched','en_route','stale');
