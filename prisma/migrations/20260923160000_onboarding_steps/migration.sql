-- The per-candidate onboarding checklist. Steps and owners: lib/core/onboarding.ts.

-- CreateEnum
CREATE TYPE "OnboardingStepKey" AS ENUM ('risk_evaluated', 'offer_issued', 'pack_issued', 'contract_signed', 'confidentiality_signed', 'covenant_signed', 'handbook_acknowledged', 'bank_details_received', 'next_of_kin_recorded', 'online_checks_confirmed', 'sia_licence_recorded', 'pin_assigned', 'indel_profile', 'watch_list', 'maps', 'casper', 'control_notified');

-- CreateTable
CREATE TABLE "OnboardingStep" (
    "id" TEXT NOT NULL,
    "candidacyId" TEXT NOT NULL,
    "step" "OnboardingStepKey" NOT NULL,
    "doneAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "doneById" TEXT,
    "note" TEXT,

    CONSTRAINT "OnboardingStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingStep_candidacyId_step_key" ON "OnboardingStep"("candidacyId", "step");

-- AddForeignKey
ALTER TABLE "OnboardingStep" ADD CONSTRAINT "OnboardingStep_candidacyId_fkey" FOREIGN KEY ("candidacyId") REFERENCES "Candidacy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingStep" ADD CONSTRAINT "OnboardingStep_doneById_fkey" FOREIGN KEY ("doneById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

