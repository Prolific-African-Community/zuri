-- CreateEnum
CREATE TYPE "MeasurementOutcome" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE', 'NOT_ENOUGH_DATA');

-- CreateTable
CREATE TABLE "ActionMeasurement" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "periodBefore" TEXT NOT NULL,
    "periodAfter" TEXT NOT NULL,
    "metricsBefore" JSONB NOT NULL,
    "metricsAfter" JSONB NOT NULL,
    "outcome" "MeasurementOutcome" NOT NULL,
    "headline" TEXT NOT NULL,
    "observation" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionMeasurement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActionMeasurement_actionId_idx" ON "ActionMeasurement"("actionId");

-- AddForeignKey
ALTER TABLE "ActionMeasurement" ADD CONSTRAINT "ActionMeasurement_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "ProposedAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
