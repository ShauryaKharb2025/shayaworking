CREATE TABLE "DoctorSlot" (
"id" TEXT NOT NULL, "doctorId" TEXT NOT NULL, "specialty" TEXT NOT NULL,
"startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3) NOT NULL, "tripId" TEXT,
CONSTRAINT "DoctorSlot_pkey" PRIMARY KEY ("id"),
CONSTRAINT "DoctorSlot_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
CONSTRAINT "DoctorSlot_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE,
CONSTRAINT "DoctorSlot_time_check" CHECK ("endsAt" > "startsAt"));
CREATE UNIQUE INDEX "DoctorSlot_tripId_key" ON "DoctorSlot"("tripId");
CREATE UNIQUE INDEX "DoctorSlot_doctorId_startsAt_key" ON "DoctorSlot"("doctorId", "startsAt");
CREATE INDEX "DoctorSlot_specialty_startsAt_idx" ON "DoctorSlot"("specialty", "startsAt");
