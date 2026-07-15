-- AlterTable: Add memberJoinEnabled field to AutoPost
ALTER TABLE "AutoPost" ADD COLUMN "memberJoinEnabled" BOOLEAN NOT NULL DEFAULT true;