-- CreateTable
CREATE TABLE "MaritimeIncident" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "caseAlias" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "episodeKey" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'detected',
    "facts" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "audit" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "MaritimeIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaritimeJob" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'recovery',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "caseVersion" INTEGER NOT NULL,
    "evidence" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "lastError" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "MaritimeJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaritimeAdvisory" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "reviewStatus" TEXT NOT NULL DEFAULT 'pending',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "execution" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaritimeAdvisory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaritimeRuntime" (
    "id" TEXT NOT NULL,
    "requests" JSONB NOT NULL DEFAULT '[]',
    "failures" INTEGER NOT NULL DEFAULT 0,
    "openUntil" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'not_checked',
    "reason" TEXT,
    "checkedAt" TIMESTAMP(3),

    CONSTRAINT "MaritimeRuntime_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MaritimeIncident_episodeKey_key" ON "MaritimeIncident"("episodeKey");

-- CreateIndex
CREATE INDEX "MaritimeIncident_tripId_createdAt_idx" ON "MaritimeIncident"("tripId", "createdAt");

-- CreateIndex
CREATE INDEX "MaritimeIncident_status_idx" ON "MaritimeIncident"("status");

-- CreateIndex
CREATE INDEX "MaritimeJob_status_nextAttemptAt_idx" ON "MaritimeJob"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "MaritimeJob_incidentId_kind_key" ON "MaritimeJob"("incidentId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "MaritimeAdvisory_jobId_key" ON "MaritimeAdvisory"("jobId");

-- AddForeignKey
ALTER TABLE "MaritimeIncident" ADD CONSTRAINT "MaritimeIncident_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaritimeJob" ADD CONSTRAINT "MaritimeJob_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "MaritimeIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaritimeAdvisory" ADD CONSTRAINT "MaritimeAdvisory_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "MaritimeJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

