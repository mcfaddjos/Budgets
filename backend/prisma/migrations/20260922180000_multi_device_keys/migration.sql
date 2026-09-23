-- Multi-device key material (decision, 2026-09-22, see PRD §10d):
-- key material moves from one-slot-per-User to one-row-per-UserDevice, and
-- DEK wrapping moves from one-slot-per-HouseholdMember to one row per
-- (device, household) pair, so more than one device can hold valid,
-- simultaneous access to the same account instead of the newest device
-- silently invalidating every earlier one.

-- AlterTable
ALTER TABLE "User" DROP COLUMN "publicKey",
DROP COLUMN "encryptedPrivateKey",
DROP COLUMN "privateKeyNonce",
DROP COLUMN "vaultKdfSalt";

-- AlterTable
ALTER TABLE "HouseholdMember" DROP COLUMN "wrappedDek";

-- CreateTable
CREATE TABLE "UserDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT,
    "publicKey" TEXT NOT NULL,
    "encryptedPrivateKey" TEXT NOT NULL,
    "privateKeyNonce" TEXT NOT NULL,
    "vaultKdfSalt" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceHouseholdKey" (
    "deviceId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "wrappedDek" TEXT NOT NULL,

    CONSTRAINT "DeviceHouseholdKey_pkey" PRIMARY KEY ("deviceId","householdId")
);

-- CreateTable
CREATE TABLE "DevicePairingSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "newPublicKey" TEXT,
    "newEncryptedPrivateKey" TEXT,
    "newPrivateKeyNonce" TEXT,
    "newVaultKdfSalt" TEXT,
    "newDeviceMac" TEXT,
    "wrappedDekForNewDevice" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DevicePairingSession_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "UserDevice" ADD CONSTRAINT "UserDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceHouseholdKey" ADD CONSTRAINT "DeviceHouseholdKey_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "UserDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceHouseholdKey" ADD CONSTRAINT "DeviceHouseholdKey_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
