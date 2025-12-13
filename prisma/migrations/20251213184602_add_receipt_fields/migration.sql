-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "receiptNumber" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "receiptSentAt" DATETIME;

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_receiptNumber_key" ON "Invoice"("receiptNumber");

