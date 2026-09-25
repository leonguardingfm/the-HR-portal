-- AlterTable
ALTER TABLE "BookOn" ADD COLUMN     "sentLateAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "CheckCall" ADD COLUMN     "clientRef" TEXT,
ADD COLUMN     "sentLateAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "failedSignIns" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastSignInAt" TIMESTAMPTZ(3),
ADD COLUMN     "lockedUntil" TIMESTAMPTZ(3),
ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "totpEnabledAt" TIMESTAMPTZ(3),
ADD COLUMN     "totpLastStep" INTEGER,
ADD COLUMN     "totpSecret" TEXT;

-- CreateTable
CREATE TABLE "PasswordReset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "requestedIp" TEXT,

    CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReplyTemplate" (
    "id" TEXT NOT NULL,
    "category" "HubCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ReplyTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PasswordReset_tokenHash_key" ON "PasswordReset"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordReset_userId_createdAt_idx" ON "PasswordReset"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ReplyTemplate_category_active_idx" ON "ReplyTemplate"("category", "active");

-- CreateIndex
CREATE UNIQUE INDEX "CheckCall_clientRef_key" ON "CheckCall"("clientRef");

-- AddForeignKey
ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- 26. Sign-in security, offline duty records, reply templates  [26 September 2026]
-- ---------------------------------------------------------------------------

-- 26a. Two-factor is on only with a secret to check codes against.
ALTER TABLE "User"
  ADD CONSTRAINT user_totp_has_secret
  CHECK ("totpEnabledAt" IS NULL OR "totpSecret" IS NOT NULL);
ALTER TABLE "User"
  ADD CONSTRAINT user_failed_sign_ins_sensible
  CHECK ("failedSignIns" BETWEEN 0 AND 1000);

-- 26b. A reset link is good for at most a day, and used at most once (usedAt).
ALTER TABLE "PasswordReset"
  ADD CONSTRAINT password_reset_short_lived
  CHECK ("expiresAt" > "createdAt" AND "expiresAt" <= "createdAt" + interval '1 day');

-- 26c. Sent late means it reached us after it was made — never before.
ALTER TABLE "CheckCall"
  ADD CONSTRAINT check_call_sent_after_made
  CHECK ("sentLateAt" IS NULL OR "sentLateAt" >= "at");
ALTER TABLE "BookOn"
  ADD CONSTRAINT book_on_sent_after_made
  CHECK ("sentLateAt" IS NULL OR "sentLateAt" >= "at");

-- 26d. A reply template has a title and words.
ALTER TABLE "ReplyTemplate"
  ADD CONSTRAINT reply_template_whole
  CHECK (length(btrim("title")) > 0 AND length(btrim("body")) > 0);
