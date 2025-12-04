import prisma from '../db/prisma';
import { PaymentMethod } from '@prisma/client';

export async function getAllPaymentMethods(): Promise<PaymentMethod[]> {
  return prisma.paymentMethod.findMany({
    where: { isEnabled: true },
    orderBy: [{ tokenSymbol: 'asc' }, { network: 'asc' }],
  });
}

export async function getPaymentMethodById(id: string): Promise<PaymentMethod | null> {
  return prisma.paymentMethod.findUnique({
    where: { id },
  });
}

export async function createPaymentMethod(params: {
  tokenSymbol: string;
  network: string;
  isEnabled?: boolean;
}): Promise<PaymentMethod> {
  return prisma.paymentMethod.create({
    data: {
      tokenSymbol: params.tokenSymbol,
      network: params.network,
      isEnabled: params.isEnabled ?? true,
    },
  });
}

