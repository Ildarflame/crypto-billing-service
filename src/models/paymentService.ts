import prisma from '../db/prisma';
import { Payment } from '@prisma/client';

export async function createPayment(params: {
  invoiceId: string;
  txHash: string;
  chain: string;
  tokenSymbol: string;
  amountToken: number;
  confirmations?: number;
  status?: string;
}): Promise<Payment> {
  return prisma.payment.create({
    data: {
      invoiceId: params.invoiceId,
      txHash: params.txHash,
      chain: params.chain,
      tokenSymbol: params.tokenSymbol,
      amountToken: params.amountToken,
      confirmations: params.confirmations,
      status: params.status || 'confirmed',
    },
  });
}

export async function getPaymentsByInvoiceId(
  invoiceId: string
): Promise<Payment[]> {
  return prisma.payment.findMany({
    where: { invoiceId },
    orderBy: { createdAt: 'desc' },
  });
}

