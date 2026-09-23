-- Optional receipt image retention + the household setting controlling it
-- (decision, 2026-09-23, see PRD §8.6). keepReceiptImages is plaintext —
-- a preference toggle, not financial content. TransactionReceiptImage is
-- encrypted the same way as every other field (§10a) and kept as its own
-- table so listing transactions never loads image bytes.

-- AlterTable
ALTER TABLE "Household" ADD COLUMN "keepReceiptImages" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "TransactionReceiptImage" (
    "transactionId" TEXT NOT NULL,
    "encryptedData" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionReceiptImage_pkey" PRIMARY KEY ("transactionId")
);

-- AddForeignKey
ALTER TABLE "TransactionReceiptImage" ADD CONSTRAINT "TransactionReceiptImage_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
