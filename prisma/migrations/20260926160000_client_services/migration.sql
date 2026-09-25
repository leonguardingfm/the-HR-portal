-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "liveSince" TIMESTAMPTZ(3),
ADD COLUMN     "portalSince" TIMESTAMPTZ(3),
ADD COLUMN     "siteIssuesSince" TIMESTAMPTZ(3);


-- ---------------------------------------------------------------------------
-- §29. Paid extras (26 September 2026): live view and site issue reports only
-- for a client who has the portal itself.
-- ---------------------------------------------------------------------------
ALTER TABLE "Client"
  ADD CONSTRAINT client_extras_need_portal
  CHECK ("portalSince" IS NOT NULL OR ("liveSince" IS NULL AND "siteIssuesSince" IS NULL));
