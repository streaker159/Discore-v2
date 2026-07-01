-- AlterEnum
BEGIN;
CREATE TYPE "LeaderboardType_new" AS ENUM ('TOP_PLAYERS_KD', 'TOP_PLAYERS_ELO', 'TOP_ALLIANCES_ELO', 'TOP_ALLIANCES_WINS', 'TOP_ALLIANCES_RANK');
ALTER TABLE "LeaderboardChannel" ALTER COLUMN "type" TYPE "LeaderboardType_new" USING ("type"::text::"LeaderboardType_new");
ALTER TYPE "LeaderboardType" RENAME TO "LeaderboardType_old";
ALTER TYPE "LeaderboardType_new" RENAME TO "LeaderboardType";
DROP TYPE "public"."LeaderboardType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "AvaMatch" DROP CONSTRAINT "AvaMatch_awayAllianceId_fkey";

-- DropForeignKey
ALTER TABLE "AvaMatch" DROP CONSTRAINT "AvaMatch_homeAllianceId_fkey";

-- AlterTable
ALTER TABLE "Guild" DROP COLUMN "avaAlertRoleId",
DROP COLUMN "avaCategoryId",
DROP COLUMN "avaChatChannelId",
DROP COLUMN "avaRequestChannelId",
DROP COLUMN "discoreAvaRoleId";

-- AlterTable
ALTER TABLE "PlayerProfile" DROP COLUMN "avaLosses",
DROP COLUMN "avaWins";

-- DropTable
DROP TABLE "AvaMatch";

-- DropEnum
DROP TYPE "AvaStatus";

