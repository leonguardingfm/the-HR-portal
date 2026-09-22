-- CreateTable
CREATE TABLE "RoleDelegation" (
    "id" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "grantedByUserId" TEXT NOT NULL,
    "grantedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(3),
    "revokedByUserId" TEXT,
    "revokedReason" TEXT,

    CONSTRAINT "RoleDelegation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoleDelegation_toUserId_startsAt_endsAt_idx" ON "RoleDelegation"("toUserId", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "RoleDelegation_role_endsAt_idx" ON "RoleDelegation"("role", "endsAt");

-- AddForeignKey
ALTER TABLE "RoleDelegation" ADD CONSTRAINT "RoleDelegation_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleDelegation" ADD CONSTRAINT "RoleDelegation_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleDelegation" ADD CONSTRAINT "RoleDelegation_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ===========================================================================
-- Constraints from prisma/constraints.sql that Prisma cannot express.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 10. Delegated roles
-- ---------------------------------------------------------------------------
-- A delegation covers an absence. Every rule here exists to stop one quietly
-- becoming an appointment.

-- 10a. It ends. The column is already NOT NULL; this is the ordering.
ALTER TABLE "RoleDelegation"
  ADD CONSTRAINT delegation_ends_after_it_starts
  CHECK ("endsAt" > "startsAt");

-- 10b. Ninety days at most. Anything longer is an appointment, and should be
-- a role grant that somebody decided to make, with its own record.
ALTER TABLE "RoleDelegation"
  ADD CONSTRAINT delegation_not_longer_than_90_days
  CHECK ("endsAt" <= "startsAt" + INTERVAL '90 days');

-- 10c. Nobody lends a role to themselves, and nobody arranges their own cover.
-- Both are the loophole that would make the rest of this pointless.
ALTER TABLE "RoleDelegation"
  ADD CONSTRAINT delegation_not_to_self
  CHECK ("toUserId" <> "fromUserId");

ALTER TABLE "RoleDelegation"
  ADD CONSTRAINT delegation_not_granted_to_self
  CHECK ("toUserId" <> "grantedByUserId");

-- 10d. A revocation is recorded whole: when, by whom, and why.
ALTER TABLE "RoleDelegation"
  ADD CONSTRAINT delegation_revocation_whole
  CHECK (num_nonnulls("revokedAt", "revokedByUserId", "revokedReason") IN (0, 3));

-- 10e. One live delegation of a role to a person at a time.
--
-- A partial unique index rather than a constraint, because it only applies
-- while the delegation is unrevoked. Two overlapping delegations of the same
-- role to the same person are not twice the cover; they are two expiry dates
-- and an argument about which one counts.
CREATE UNIQUE INDEX delegation_one_live_per_role_per_person
  ON "RoleDelegation" ("role", "toUserId")
  WHERE "revokedAt" IS NULL;

-- 10f. The lender actually holds the role.
--
-- Needs UserRole, so it is a trigger. Without it, a role nobody holds can be
-- lent — which reads as authority and is not.
CREATE OR REPLACE FUNCTION enforce_delegation_source()
RETURNS TRIGGER AS $$
DECLARE
  holds INT;
BEGIN
  SELECT count(*) INTO holds
    FROM "UserRole"
    WHERE "userId" = NEW."fromUserId"
      AND "role" = NEW."role"
      AND "revokedAt" IS NULL;

  IF holds = 0 THEN
    RAISE EXCEPTION
      'A role cannot be delegated by somebody who does not hold it (%)', NEW."role";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER delegation_source
  BEFORE INSERT ON "RoleDelegation"
  FOR EACH ROW EXECUTE FUNCTION enforce_delegation_source();
