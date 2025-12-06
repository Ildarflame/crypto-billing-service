-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "paymentProvider" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "providerInvoiceUrl" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "providerPaymentId" TEXT;
