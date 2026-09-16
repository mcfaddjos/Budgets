-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "ownerUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
