-- When a post's officers make check calls: always, never, or only on night
-- duty and at weekends (Control, 24 September 2026). Replaces a yes/no.
CREATE TYPE "CheckCallRule" AS ENUM ('always', 'nights_and_weekends', 'never');

ALTER TABLE "Post" ADD COLUMN "checkCalls" "CheckCallRule" NOT NULL DEFAULT 'always';

-- Carry the old answer across: yes stays always. The posts that said no were
-- the day posts Control named as needing calls at night and at weekends.
UPDATE "Post" SET "checkCalls" = CASE WHEN "checkCallsRequired" THEN 'always'::"CheckCallRule" ELSE 'nights_and_weekends'::"CheckCallRule" END;

ALTER TABLE "Post" DROP COLUMN "checkCallsRequired";
