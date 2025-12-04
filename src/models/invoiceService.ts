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
}): Promise<Invoice> {
  return prisma.invoice.create({
    data: {
      subscriptionId: params.subscriptionId,
      planId: params.planId,
      amountUsd: params.amountUsd,
      keagateInvoiceId: params.keagateInvoiceId,
      keagateInvoiceUrl: params.keagateInvoiceUrl,
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
  }
): Promise<Invoice> {
  return prisma.invoice.update({
    where: { id },
    data,
  });
}

