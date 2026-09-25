-- CreateEnum
CREATE TYPE "OfficerIdentity" AS ENUM ('none', 'name', 'name_and_sia');

-- AlterEnum
ALTER TYPE "HubSource" ADD VALUE 'client_portal';

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "officerIdentity" "OfficerIdentity" NOT NULL DEFAULT 'none';

-- AlterTable
ALTER TABLE "HubTask" ADD COLUMN     "clientUpdate" TEXT,
ADD COLUMN     "clientUpdateAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "clientId" TEXT;

-- CreateTable
CREATE TABLE "ClientContactSite" (
    "userId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,

    CONSTRAINT "ClientContactSite_pkey" PRIMARY KEY ("userId","siteId")
);

-- CreateIndex
CREATE INDEX "ClientContactSite_siteId_idx" ON "ClientContactSite"("siteId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientContactSite" ADD CONSTRAINT "ClientContactSite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientContactSite" ADD CONSTRAINT "ClientContactSite_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- §27. The client portal (26 September 2026): no client sees another's.
-- ---------------------------------------------------------------------------

-- 27a. A client contact's sites are their own organisation's — never another client's.
CREATE OR REPLACE FUNCTION client_contact_site_same_client() RETURNS trigger AS $$
BEGIN
  IF (SELECT "clientId" FROM "Site" WHERE id = NEW."siteId") IS DISTINCT FROM (SELECT "clientId" FROM "User" WHERE id = NEW."userId") THEN
    RAISE EXCEPTION 'client_contact_site_same_client: a client contact can only be given their own organisation''s sites';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER client_contact_site_same_client
  BEFORE INSERT OR UPDATE ON "ClientContactSite"
  FOR EACH ROW EXECUTE FUNCTION client_contact_site_same_client();

-- 27b. A client login holds the client role and nothing else; a client role belongs to a client login.
CREATE OR REPLACE FUNCTION user_role_client_only() RETURNS trigger AS $$
DECLARE c TEXT;
BEGIN
  SELECT "clientId" INTO c FROM "User" WHERE id = NEW."userId";
  IF c IS NOT NULL AND NEW.role::text <> 'client' THEN
    RAISE EXCEPTION 'user_role_client_only: a client contact cannot hold a staff role';
  END IF;
  IF c IS NULL AND NEW.role::text = 'client' AND NEW."revokedAt" IS NULL THEN
    RAISE EXCEPTION 'user_role_client_only: a client login must belong to a client';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER user_role_client_only
  BEFORE INSERT OR UPDATE ON "UserRole"
  FOR EACH ROW EXECUTE FUNCTION user_role_client_only();

-- 27c. Once a login belongs to a client, it always does — it cannot be moved to another,
--      and a staff login cannot quietly become a client's.
CREATE OR REPLACE FUNCTION user_client_fixed() RETURNS trigger AS $$
BEGIN
  IF OLD."clientId" IS DISTINCT FROM NEW."clientId" THEN
    RAISE EXCEPTION 'user_client_fixed: which client a login belongs to cannot change';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER user_client_fixed
  BEFORE UPDATE OF "clientId" ON "User"
  FOR EACH ROW EXECUTE FUNCTION user_client_fixed();

-- 27d. A request from the portal says whose it is and who raised it; a message
--      to the client says when it was written.
ALTER TABLE "HubTask"
  ADD CONSTRAINT hub_task_client_portal_whole
  CHECK (source::text <> 'client_portal' OR ("clientId" IS NOT NULL AND "createdById" IS NOT NULL));
ALTER TABLE "HubTask"
  ADD CONSTRAINT hub_task_client_update_dated
  CHECK (("clientUpdate" IS NULL) = ("clientUpdateAt" IS NULL));
