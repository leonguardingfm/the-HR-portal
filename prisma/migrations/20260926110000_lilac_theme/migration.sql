-- Lilac replaces navy among the colour themes (25 September 2026). Anyone on
-- navy moves to the matching lilac, tinted or shaded.
ALTER TABLE "User" DROP CONSTRAINT user_theme_known;
UPDATE "User" SET "theme" = replace("theme", 'navy-', 'lilac-') WHERE "theme" LIKE 'navy-%';
ALTER TABLE "User"
  ADD CONSTRAINT user_theme_known
  CHECK ("theme" IN ('white', 'dark', 'system',
    'lilac-tinted', 'lilac-shaded', 'royal-tinted', 'royal-shaded',
    'gold-tinted', 'gold-shaded', 'teal-tinted', 'teal-shaded'));
