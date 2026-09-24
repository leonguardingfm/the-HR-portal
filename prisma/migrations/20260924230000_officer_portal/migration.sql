-- Officers get their own portal (Control, 24 September 2026): a role that sees
-- their own duties and nothing else, and an account type attached to their
-- existing record.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'officer';
ALTER TYPE "AccountDepartment" ADD VALUE IF NOT EXISTS 'officer';

-- 20a, relaxed: the officer confirming or saying they cannot attend from their
-- own portal has no channel of Control's to record. "No answer" still says how
-- they were tried.
ALTER TABLE "ChaseUp" DROP CONSTRAINT chase_up_how_tried;
ALTER TABLE "ChaseUp"
  ADD CONSTRAINT chase_up_how_tried
  CHECK (outcome <> 'no_answer' OR channel IS NOT NULL);
