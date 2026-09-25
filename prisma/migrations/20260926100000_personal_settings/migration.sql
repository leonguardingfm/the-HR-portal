-- AlterTable
ALTER TABLE "User" ADD COLUMN     "soundOn" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "theme" TEXT NOT NULL DEFAULT 'white';


-- ---------------------------------------------------------------------------
-- 25. Personal settings  [25 September 2026]
-- ---------------------------------------------------------------------------

-- 25a. A theme is one of the offered ones: white, dark, following the device,
-- or one of four colours tinted (light) or shaded (dark).
ALTER TABLE "User"
  ADD CONSTRAINT user_theme_known
  CHECK ("theme" IN ('white', 'dark', 'system',
    'navy-tinted', 'navy-shaded', 'royal-tinted', 'royal-shaded',
    'gold-tinted', 'gold-shaded', 'teal-tinted', 'teal-shaded'));
