-- AlterEnum
BEGIN;
CREATE TYPE "Tier_new" AS ENUM ('FREE', 'PRO', 'LIFETIME');
ALTER TABLE "public"."GuildPremium" ALTER COLUMN "tier" DROP DEFAULT;
ALTER TABLE "GuildPremium" ALTER COLUMN "tier" TYPE "Tier_new" USING ("tier"::text::"Tier_new");
ALTER TABLE "PremiumCode" ALTER COLUMN "tier" TYPE "Tier_new" USING ("tier"::text::"Tier_new");
ALTER TYPE "Tier" RENAME TO "Tier_old";
ALTER TYPE "Tier_new" RENAME TO "Tier";
DROP TYPE "public"."Tier_old";
ALTER TABLE "GuildPremium" ALTER COLUMN "tier" SET DEFAULT 'FREE';
COMMIT;

