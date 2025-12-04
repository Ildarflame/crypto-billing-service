import prisma from '../db/prisma';
import { Plan } from '@prisma/client';

export async function getPlanByCode(code: string): Promise<Plan | null> {
  return prisma.plan.findUnique({
    where: { code },
  });
}

export async function getAllPlans(): Promise<Plan[]> {
  return prisma.plan.findMany({
    orderBy: { createdAt: 'asc' },
  });
}

