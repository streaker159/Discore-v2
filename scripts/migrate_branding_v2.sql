-- Branding V2: per-scoreboard image, no colour
ALTER TABLE "Scoreboard"
ADD COLUMN IF NOT EXISTS "brandingImageUrl" TEXT;