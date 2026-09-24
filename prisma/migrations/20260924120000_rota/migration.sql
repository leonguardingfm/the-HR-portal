-- CreateEnum
CREATE TYPE "AskChannel" AS ENUM ('phone', 'whatsapp', 'sms', 'in_person');

-- CreateEnum
CREATE TYPE "AskAnswer" AS ENUM ('yes', 'no', 'no_answer');

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "regularPersonId" TEXT;

-- CreateTable
CREATE TABLE "ShiftAsk" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "askedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "askedById" TEXT NOT NULL,
    "channel" "AskChannel" NOT NULL,
    "answer" "AskAnswer" NOT NULL,
    "note" TEXT,
    "assignmentId" TEXT,

    CONSTRAINT "ShiftAsk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShiftAsk_assignmentId_key" ON "ShiftAsk"("assignmentId");

-- CreateIndex
CREATE INDEX "ShiftAsk_postId_startsAt_idx" ON "ShiftAsk"("postId", "startsAt");

-- CreateIndex
CREATE INDEX "ShiftAsk_personId_startsAt_idx" ON "ShiftAsk"("personId", "startsAt");

-- CreateIndex
CREATE INDEX "ShiftAsk_askedAt_idx" ON "ShiftAsk"("askedAt");

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_regularPersonId_fkey" FOREIGN KEY ("regularPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAsk" ADD CONSTRAINT "ShiftAsk_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAsk" ADD CONSTRAINT "ShiftAsk_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAsk" ADD CONSTRAINT "ShiftAsk_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- 17. Building the rota  [Control, 24 September 2026]
-- ---------------------------------------------------------------------------
-- Availability is known by asking, so the ask is the record of it. A yes is
-- what put the shift on the rota; anything else did not.

-- 17a. An asked-about shift ends after it starts, like the shift itself.
ALTER TABLE "ShiftAsk"
  ADD CONSTRAINT shift_ask_ends_after_start
  CHECK ("endsAt" > "startsAt");

-- 17b. A yes names the draft it made, and only a yes does.
ALTER TABLE "ShiftAsk"
  ADD CONSTRAINT shift_ask_yes_has_shift
  CHECK (("answer" = 'yes') = ("assignmentId" IS NOT NULL));

-- 17c. The shift a yes names is the one that was asked about: the same
-- officer, the same post, the same hours.
CREATE OR REPLACE FUNCTION enforce_shift_ask_matches() RETURNS trigger AS $$
BEGIN
  IF NEW."assignmentId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Assignment" a
    WHERE a.id = NEW."assignmentId"
      AND a."personId" = NEW."personId"
      AND a."postId" = NEW."postId"
      AND a."startsAt" = NEW."startsAt"
      AND a."endsAt" = NEW."endsAt"
  ) THEN
    RAISE EXCEPTION 'A yes names the shift that was asked about: same officer, post and hours'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER shift_ask_matches
  BEFORE INSERT OR UPDATE ON "ShiftAsk"
  FOR EACH ROW EXECUTE FUNCTION enforce_shift_ask_matches();
