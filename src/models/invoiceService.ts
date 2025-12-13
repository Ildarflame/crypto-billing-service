import prisma from '../db/prisma';
import { Invoice, Plan, Subscription } from '@prisma/client';

export interface InvoiceWithRelations extends Invoice {
  plan: Plan;
  subscription: Subscription;
}

export async function createInvoice(params: {
  subscriptionId: string;
  planId: string;
  amountUsd: number;
  keagateInvoiceId?: string;
  keagateInvoiceUrl?: string;
  paymentProvider?: string;
  providerPaymentId?: string;
  providerInvoiceUrl?: string;
}): Promise<Invoice> {
  return prisma.invoice.create({
    data: {
      subscriptionId: params.subscriptionId,
      planId: params.planId,
      amountUsd: params.amountUsd,
      keagateInvoiceId: params.keagateInvoiceId,
      keagateInvoiceUrl: params.keagateInvoiceUrl,
      paymentProvider: params.paymentProvider,
      providerPaymentId: params.providerPaymentId,
      providerInvoiceUrl: params.providerInvoiceUrl,
      status: 'pending',
    },
  });
}

export async function getInvoiceById(
  id: string
): Promise<InvoiceWithRelations | null> {
  return prisma.invoice.findUnique({
    where: { id },
    include: {
      plan: true,
      subscription: true,
    },
  });
}

/**
 * @deprecated Keagate integration has been removed. This function is kept for backward compatibility only.
 */
export async function getInvoiceByKeagateId(
  keagateInvoiceId: string
): Promise<InvoiceWithRelations | null> {
  return prisma.invoice.findFirst({
    where: { keagateInvoiceId },
    include: {
      plan: true,
      subscription: true,
    },
  });
}

export async function getInvoiceByProviderPaymentId(
  providerPaymentId: string
): Promise<InvoiceWithRelations | null> {
  return prisma.invoice.findFirst({
    where: { providerPaymentId },
    include: {
      plan: true,
      subscription: true,
    },
  });
}

export async function getInvoiceByIdInternal(
  id: string
): Promise<InvoiceWithRelations | null> {
  return prisma.invoice.findUnique({
    where: { id },
    include: {
      plan: true,
      subscription: true,
    },
  });
}

export async function updateInvoice(
  id: string,
  data: {
    status?: string;
    paidAt?: Date;
    keagateInvoiceId?: string;
    keagateInvoiceUrl?: string;
    paymentProvider?: string;
    providerPaymentId?: string;
    providerInvoiceUrl?: string;
    receiptNumber?: string;
    receiptSentAt?: Date;
  }
): Promise<Invoice> {
  return prisma.invoice.update({
    where: { id },
    data,
  });
}

/**
 * Generates a unique receipt number in format SI-YYYY-NNNNNN
 * Example: SI-2025-000123
 */
export async function generateReceiptNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `SI-${year}-`;

  // Find the highest receipt number for this year
  const invoices = await prisma.invoice.findMany({
    where: {
      receiptNumber: {
        startsWith: prefix,
      },
    },
    select: {
      receiptNumber: true,
    },
    orderBy: {
      receiptNumber: 'desc',
    },
    take: 1,
  });

  let nextNumber = 1;
  if (invoices.length > 0 && invoices[0].receiptNumber) {
    const lastNumber = invoices[0].receiptNumber.replace(prefix, '');
    const parsed = parseInt(lastNumber, 10);
    if (!isNaN(parsed)) {
      nextNumber = parsed + 1;
    }
  }

  // Format with leading zeros (6 digits)
  const formattedNumber = String(nextNumber).padStart(6, '0');
  return `${prefix}${formattedNumber}`;
}

