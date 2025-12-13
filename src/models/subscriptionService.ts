import prisma from '../db/prisma';
import { Subscription, Plan } from '@prisma/client';

export interface SubscriptionWithPlan extends Subscription {
  plan: Plan;
}

export interface ComputeExpirationParams {
  plan: Plan;
  currentStartsAt: Date | null;
  currentExpiresAt: Date | null;
}

export interface ComputedExpiration {
  startsAt: Date;
  expiresAt: Date | null;
}

/**
 * Computes new startsAt and expiresAt for a subscription based on payment.
 * Rules:
 * - First payment: startsAt = now, expiresAt = now + durationDays
 * - Renewal (active subscription):
 *   - If expiresAt > now: expiresAt = expiresAt + durationDays
 *   - Else: expiresAt = now + durationDays
 */
export function computeSubscriptionExpiration(
  params: ComputeExpirationParams
): ComputedExpiration {
  const { plan, currentStartsAt, currentExpiresAt } = params;
  const now = new Date();

  // First payment - no existing subscription dates
  if (!currentStartsAt) {
    return {
      startsAt: now,
      expiresAt: plan.durationDays
        ? new Date(now.getTime() + plan.durationDays * 24 * 60 * 60 * 1000)
        : null,
    };
  }

  // Renewal - extend existing subscription
  if (currentExpiresAt && currentExpiresAt > now) {
    // Still active, extend from current expiration
    return {
      startsAt: currentStartsAt, // Keep original start date
      expiresAt: plan.durationDays
        ? new Date(
            currentExpiresAt.getTime() +
              plan.durationDays * 24 * 60 * 60 * 1000
          )
        : null,
    };
  } else {
    // Expired or null, start from now
    return {
      startsAt: now,
      expiresAt: plan.durationDays
        ? new Date(now.getTime() + plan.durationDays * 24 * 60 * 60 * 1000)
        : null,
    };
  }
}

export async function createSubscription(params: {
  userEmail: string;
  productCode: string;
  planId: string;
  inviteCodeId?: string;
}): Promise<Subscription> {
  return prisma.subscription.create({
    data: {
      userEmail: params.userEmail,
      productCode: params.productCode,
      planId: params.planId,
      inviteCodeId: params.inviteCodeId,
      status: 'pending_payment',
    },
  });
}

export async function getSubscriptionById(
  id: string
): Promise<SubscriptionWithPlan | null> {
  return prisma.subscription.findUnique({
    where: { id },
    include: { plan: true },
  });
}

export async function updateSubscription(
  id: string,
  data: {
    status?: string;
    licenseKey?: string;
    startsAt?: Date | null;
    expiresAt?: Date | null;
  }
): Promise<Subscription> {
  return prisma.subscription.update({
    where: { id },
    data,
  });
}

export async function getSubscriptions(params: {
  page?: number;
  limit?: number;
}): Promise<{ subscriptions: SubscriptionWithPlan[]; total: number }> {
  const page = params.page || 1;
  const limit = params.limit || 50;
  const skip = (page - 1) * limit;

  const [subscriptions, total] = await Promise.all([
    prisma.subscription.findMany({
      skip,
      take: limit,
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.subscription.count(),
  ]);

  return { subscriptions, total };
}

