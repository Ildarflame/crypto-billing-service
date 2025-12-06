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
  }
): Promise<Invoice> {
  return prisma.invoice.update({
    where: { id },
    data,
  });
}

