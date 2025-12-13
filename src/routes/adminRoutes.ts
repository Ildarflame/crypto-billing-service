import { Router, Request, Response } from 'express';
import { createError } from '../middlewares/errorHandler';
import prisma from '../db/prisma';
import type { InviteCodeType, InviteCodeStatus } from '../types/invite';
import { VALID_INVITE_CODE_TYPES, VALID_INVITE_CODE_STATUSES } from '../types/invite';
import { updateLicenseFromSubscription } from '../integrations/shadowInternClient';

const router = Router();

/**
 * GET /api/admin/invite-codes
 * Get list of invite codes (admin only)
 * Query params:
 * - code (optional, exact match)
 * - ownerEmail (optional, contains/startsWith search)
 * - type (optional: "INVITE" | "REFERRAL" | "PARTNER")
 * - status (optional: "ACTIVE" | "PAUSED" | "EXPIRED")
 */
router.get('/invite-codes', async (req: Request, res: Response, next) => {
  try {
    const code = req.query.code as string | undefined;
    const ownerEmail = req.query.ownerEmail as string | undefined;
    const type = req.query.type as string | undefined;
    const status = req.query.status as string | undefined;

    console.log('[ADMIN Invite] GET /invite-codes', {
      code: code ? '***' : undefined,
      ownerEmail: ownerEmail ? '***' : undefined,
      type,
      status,
    });

    const where: any = {};

    // Exact match for code
    if (code) {
      where.code = code.trim().toLowerCase();
    }

    // Contains search for ownerEmail (SQLite doesn't support case-insensitive mode)
    if (ownerEmail) {
      const emailSearch = ownerEmail.trim();
      // SQLite: use contains filter (case-sensitive in SQLite, but we'll search anyway)
      where.ownerEmail = {
        contains: emailSearch,
      };
    }

    // Filter by type
    if (type) {
      const upperType = type.toUpperCase();
      if (VALID_INVITE_CODE_TYPES.includes(upperType as InviteCodeType)) {
        where.type = upperType;
      }
    }

    // Filter by status
    if (status) {
      const upperStatus = status.toUpperCase();
      if (VALID_INVITE_CODE_STATUSES.includes(upperStatus as InviteCodeStatus)) {
        where.status = upperStatus;
      }
    }

    // If code is provided, return single invite or 404
    if (code) {
      const inviteCode = await prisma.inviteCode.findUnique({
        where: { code: code.trim().toLowerCase() },
      });

      if (!inviteCode) {
        throw createError('Invite code not found', 404);
      }

      const remaining =
        inviteCode.maxUses !== null
          ? inviteCode.maxUses - inviteCode.usedCount
          : null;

      return res.json({
        id: inviteCode.id,
        code: inviteCode.code,
        type: inviteCode.type,
        status: inviteCode.status,
        maxUses: inviteCode.maxUses,
        usedCount: inviteCode.usedCount,
        remaining,
        ownerEmail: inviteCode.ownerEmail,
        notes: inviteCode.notes,
        revenueSharePercent: inviteCode.revenueSharePercent ?? 0,
        createdAt: inviteCode.createdAt.toISOString(),
        expiresAt: inviteCode.expiresAt?.toISOString() || null,
      });
    }

    // Otherwise return list (last 100 ordered by createdAt desc)
    const inviteCodes = await prisma.inviteCode.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    res.json({
      inviteCodes: inviteCodes.map((ic) => {
        const remaining = ic.maxUses !== null ? ic.maxUses - ic.usedCount : null;
        return {
          id: ic.id,
          code: ic.code,
          type: ic.type,
          status: ic.status,
          maxUses: ic.maxUses,
          usedCount: ic.usedCount,
          remaining,
          ownerEmail: ic.ownerEmail,
          notes: ic.notes,
          revenueSharePercent: ic.revenueSharePercent ?? 0,
          createdAt: ic.createdAt.toISOString(),
          expiresAt: ic.expiresAt?.toISOString() || null,
        };
      }),
    });
  } catch (error: any) {
    if (error.statusCode) {
      next(error);
    } else {
      console.error('[ADMIN Invite] GET /invite-codes Error:', error);
      next(createError('Internal server error', 500));
    }
  }
});

/**
 * POST /api/admin/invite-codes
 * Create a new invite code (admin only)
 */
router.post('/invite-codes', async (req: Request, res: Response, next) => {
  try {
    const { code, type, maxUses, expiresAt, ownerEmail, notes, revenueSharePercent } = req.body;

    console.log('[ADMIN Invite] POST /invite-codes', {
      code: code ? '***' : undefined,
      type,
      maxUses,
      ownerEmail: ownerEmail ? '***' : undefined,
      revenueSharePercent,
    });

    if (!code || typeof code !== 'string') {
      throw createError('Code is required', 400);
    }

    // Normalize code: trim and lowercase
    const normalizedCode = code.trim().toLowerCase();

    if (!normalizedCode) {
      throw createError('Code cannot be empty', 400);
    }

    // Check if code already exists
    const existing = await prisma.inviteCode.findUnique({
      where: { code: normalizedCode },
    });

    if (existing) {
      throw createError('Code already exists', 400);
    }

    // Validate type if provided
    const inviteType: InviteCodeType =
      type && VALID_INVITE_CODE_TYPES.includes(type.toUpperCase() as InviteCodeType)
        ? (type.toUpperCase() as InviteCodeType)
        : 'INVITE';

    // Parse expiresAt if provided
    let expiresAtDate: Date | null = null;
    if (expiresAt) {
      expiresAtDate = new Date(expiresAt);
      if (isNaN(expiresAtDate.getTime())) {
        throw createError('Invalid expiresAt date format', 400);
      }
    }

    // Validate maxUses if provided
    let maxUsesInt: number | null = null;
    if (maxUses !== undefined && maxUses !== null) {
      maxUsesInt = parseInt(String(maxUses), 10);
      if (isNaN(maxUsesInt) || maxUsesInt < 1) {
        throw createError('maxUses must be a positive integer', 400);
      }
    }

    // Validate revenueSharePercent if provided
    let revenueSharePercentInt: number | null = null;
    if (revenueSharePercent !== undefined && revenueSharePercent !== null) {
      revenueSharePercentInt = parseInt(String(revenueSharePercent), 10);
      if (isNaN(revenueSharePercentInt) || revenueSharePercentInt < 0 || revenueSharePercentInt > 100) {
        throw createError('revenueSharePercent must be a number between 0 and 100', 400);
      }
    } else {
      revenueSharePercentInt = 0; // Default to 0 if not provided
    }

    const inviteCode = await prisma.inviteCode.create({
      data: {
        code: normalizedCode,
        type: inviteType,
        status: 'ACTIVE', // Default status
        maxUses: maxUsesInt,
        expiresAt: expiresAtDate,
        ownerEmail: ownerEmail || null,
        notes: notes || null,
        revenueSharePercent: revenueSharePercentInt,
      },
    });

    const remaining =
      inviteCode.maxUses !== null
        ? inviteCode.maxUses - inviteCode.usedCount
        : null;

    res.status(201).json({
      id: inviteCode.id,
      code: inviteCode.code,
      type: inviteCode.type,
      status: inviteCode.status,
      maxUses: inviteCode.maxUses,
      usedCount: inviteCode.usedCount,
      remaining,
      ownerEmail: inviteCode.ownerEmail,
      notes: inviteCode.notes,
      revenueSharePercent: inviteCode.revenueSharePercent ?? 0,
      createdAt: inviteCode.createdAt.toISOString(),
      expiresAt: inviteCode.expiresAt?.toISOString() || null,
    });
  } catch (error: any) {
    if (error.statusCode) {
      next(error);
    } else {
      console.error('[ADMIN Invite] POST /invite-codes Error:', error);
      next(createError('Internal server error', 500));
    }
  }
});

/**
 * PATCH /api/admin/invite-codes/:id
 * Update an invite code (admin only)
 */
router.patch('/invite-codes/:id', async (req: Request, res: Response, next) => {
  try {
    const { id } = req.params;
    const { status, maxUses, notes, revenueSharePercent } = req.body;

    console.log('[ADMIN Invite] PATCH /invite-codes/:id', {
      id,
      status,
      maxUses,
      hasNotes: !!notes,
      revenueSharePercent,
    });

    // Check if invite code exists
    const existing = await prisma.inviteCode.findUnique({
      where: { id },
    });

    if (!existing) {
      throw createError('Invite code not found', 404);
    }

    // Build update data
    const updateData: any = {};

    if (status !== undefined) {
      const upperStatus = status.toUpperCase();
      if (!VALID_INVITE_CODE_STATUSES.includes(upperStatus as InviteCodeStatus)) {
        throw createError(
          'Invalid status. Must be one of: ACTIVE, PAUSED, EXPIRED',
          400
        );
      }
      updateData.status = upperStatus as InviteCodeStatus;
    }

    if (maxUses !== undefined) {
      if (maxUses === null) {
        updateData.maxUses = null;
      } else {
        const maxUsesInt = parseInt(String(maxUses), 10);
        if (isNaN(maxUsesInt) || maxUsesInt < 1) {
          throw createError('maxUses must be a positive integer or null', 400);
        }
        updateData.maxUses = maxUsesInt;
      }
    }

    if (notes !== undefined) {
      updateData.notes = notes || null;
    }

    if (revenueSharePercent !== undefined && revenueSharePercent !== null) {
      const revenueSharePercentInt = parseInt(String(revenueSharePercent), 10);
      if (isNaN(revenueSharePercentInt) || revenueSharePercentInt < 0 || revenueSharePercentInt > 100) {
        throw createError('revenueSharePercent must be a number between 0 and 100', 400);
      }
      updateData.revenueSharePercent = revenueSharePercentInt;
    }

    const updated = await prisma.inviteCode.update({
      where: { id },
      data: updateData,
    });

    const remaining =
      updated.maxUses !== null ? updated.maxUses - updated.usedCount : null;

    res.json({
      id: updated.id,
      code: updated.code,
      type: updated.type,
      status: updated.status,
      maxUses: updated.maxUses,
      usedCount: updated.usedCount,
      remaining,
      ownerEmail: updated.ownerEmail,
      notes: updated.notes,
      revenueSharePercent: updated.revenueSharePercent ?? 0,
      createdAt: updated.createdAt.toISOString(),
      expiresAt: updated.expiresAt?.toISOString() || null,
    });
  } catch (error: any) {
    if (error.statusCode) {
      next(error);
    } else {
      console.error('[ADMIN Invite] PATCH /invite-codes/:id Error:', error);
      next(createError('Internal server error', 500));
    }
  }
});

/**
 * GET /api/admin/subscriptions
 * Get list of subscriptions (admin only)
 * Query params:
 * - email (filter by userEmail, case-insensitive contains or exact match)
 * - status (filter by subscription status)
 * - planCode (filter by plan code)
 * - inviteCode (filter by invite code string)
 * - limit (default 50, max 200)
 */
router.get('/subscriptions', async (req: Request, res: Response, next) => {
  try {
    const { email, status, planCode, limit: limitRaw, inviteCode } = req.query;

    const limit = Math.min(
      parseInt(limitRaw as string) || 50,
      200
    );

    console.log('[ADMIN Subscriptions] GET /subscriptions', {
      email: email ? '***' : undefined,
      status,
      planCode,
      inviteCode,
      limit,
    });

    const where: any = {};

    if (email && typeof email === 'string') {
      const emailSearch = email.trim();
      // SQLite: use contains filter for email search
      where.userEmail = {
        contains: emailSearch,
      };
    }

    if (status && typeof status === 'string') {
      where.status = status;
    }

    if (planCode && typeof planCode === 'string') {
      where.plan = {
        code: planCode.trim(),
      };
    }

    if (inviteCode && typeof inviteCode === 'string') {
      where.inviteCode = {
        code: inviteCode.trim(),
      };
    }

    const subscriptions = await prisma.subscription.findMany({
      where,
      include: {
        plan: true,
        inviteCode: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    res.json({
      subscriptions: subscriptions.map((sub) => ({
        id: sub.id,
        userEmail: sub.userEmail,
        planCode: sub.plan.code,
        status: sub.status,
        licenseKey: sub.licenseKey,
        startsAt: sub.startsAt?.toISOString() || null,
        expiresAt: sub.expiresAt?.toISOString() || null,
        createdAt: sub.createdAt.toISOString(),
        inviteCode: sub.inviteCode
          ? {
              id: sub.inviteCode.id,
              code: sub.inviteCode.code,
              type: sub.inviteCode.type,
              ownerEmail: sub.inviteCode.ownerEmail,
              revenueSharePercent: sub.inviteCode.revenueSharePercent ?? 0,
            }
          : null,
      })),
    });
  } catch (error: any) {
    console.error('[ADMIN Subscriptions] GET /subscriptions Error:', error);
    next(createError('Internal server error', 500));
  }
});

/**
 * PATCH /api/admin/subscriptions/:id
 * Update a subscription (admin only)
 * Request body:
 * - status?: string (optional: new status)
 * - expiresAt?: string (optional ISO date string to set exact expiry)
 * - addDays?: number (optional: number of days to extend from current expiresAt or now)
 * - inviteCode?: string (optional: invite code string to link subscription to)
 */
router.patch('/subscriptions/:id', async (req: Request, res: Response, next) => {
  try {
    const { id } = req.params;
    const { status, expiresAt, addDays, inviteCode, maxRequests } = req.body;

    console.log('[ADMIN Subscriptions] PATCH /subscriptions/:id', {
      id,
      status,
      expiresAt,
      addDays,
      inviteCode: inviteCode ? '***' : undefined,
    });

    // Validate that at least one field is provided
    if (
      status === undefined &&
      expiresAt === undefined &&
      addDays === undefined &&
      inviteCode === undefined
    ) {
      throw createError('At least one field (status, expiresAt, addDays, inviteCode) must be provided', 400);
    }

    // Fetch current subscription
    const existing = await prisma.subscription.findUnique({
      where: { id },
      include: { inviteCode: true },
    });

    if (!existing) {
      throw createError('Subscription not found', 404);
    }

    // Build update data object
    const data: any = {};

    if (status !== undefined && typeof status === 'string') {
      data.status = status;
    }

    if (typeof addDays === 'number' && addDays !== 0) {
      // Extend expiresAt
      const baseDate = existing.expiresAt ?? new Date();
      const newDate = new Date(baseDate);
      newDate.setDate(newDate.getDate() + addDays);
      data.expiresAt = newDate;
    } else if (expiresAt !== undefined && typeof expiresAt === 'string') {
      const newDate = new Date(expiresAt);
      if (!isNaN(newDate.getTime())) {
        data.expiresAt = newDate;
      } else {
        throw createError('Invalid expiresAt date format', 400);
      }
    }

    if (inviteCode !== undefined) {
      if (inviteCode === null || (typeof inviteCode === 'string' && inviteCode.trim().length === 0)) {
        // Allow clearing the invite code
        data.inviteCodeId = null;
      } else if (typeof inviteCode === 'string') {
        const codeValue = inviteCode.trim();
        if (codeValue.length > 0) {
          const code = await prisma.inviteCode.findUnique({
            where: { code: codeValue },
          });
          if (!code) {
            throw createError('Invite code not found', 400);
          }
          data.inviteCodeId = code.id;
        }
      }
    }

    // Apply update
    const updated = await prisma.subscription.update({
      where: { id },
      data,
      include: {
        plan: true,
        inviteCode: true,
      },
    });

    // Update Shadow Intern license if subscription was modified
    try {
      await updateLicenseFromSubscription({
        subscriptionId: updated.id,
        userEmail: updated.userEmail,
        licenseKey: updated.licenseKey,
        status: status !== undefined ? status : undefined,
        expiresAt: data.expiresAt !== undefined ? (data.expiresAt as Date | null) : undefined,
        addDays: addDays !== undefined ? addDays : undefined,
        maxRequests: maxRequests !== undefined ? (maxRequests !== null ? Number(maxRequests) : null) : undefined,
      });
    } catch (shadowInternError) {
      // Log error but don't fail the request - admin UI should still see 200
      console.error('[ShadowIntern] License update failed in admin PATCH handler:', shadowInternError);
    }

    // Return normalized response
    return res.json({
      subscription: {
        id: updated.id,
        userEmail: updated.userEmail,
        status: updated.status,
        planCode: updated.plan?.code ?? null,
        licenseKey: updated.licenseKey,
        expiresAt: updated.expiresAt,
        inviteCode: updated.inviteCode
          ? {
              id: updated.inviteCode.id,
              code: updated.inviteCode.code,
              type: updated.inviteCode.type,
              ownerEmail: updated.inviteCode.ownerEmail,
              revenueSharePercent: updated.inviteCode.revenueSharePercent ?? 0,
            }
          : null,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (error: any) {
    if (error.statusCode) {
      next(error);
    } else {
      console.error('[ADMIN Subscriptions PATCH] Error:', error);
      next(createError('Internal server error', 500));
    }
  }
});

/**
 * GET /api/admin/invoices
 * Get list of invoices (admin only)
 * Query params:
 * - email (filter by subscription.userEmail)
 * - status (filter by invoice.status)
 * - providerPaymentId (filter by providerPaymentId)
 * - orderId (filter by invoice id - since orderId field doesn't exist in schema, we use id)
 * - limit (default 50, max 200)
 */
router.get('/invoices', async (req: Request, res: Response, next) => {
  try {
    const { email, status, providerPaymentId, orderId, limit: limitRaw } = req.query;

    const limit = Math.min(
      parseInt(limitRaw as string) || 50,
      200
    );

    console.log('[ADMIN Invoices] GET /invoices', {
      email: email ? '***' : undefined,
      status,
      providerPaymentId,
      orderId,
      limit,
    });

    const where: any = {};

    if (status && typeof status === 'string') {
      where.status = status;
    }

    if (providerPaymentId && typeof providerPaymentId === 'string') {
      where.providerPaymentId = providerPaymentId;
    }

    if (orderId && typeof orderId === 'string') {
      // Note: Invoice schema doesn't have orderId field, so we filter by id instead
      where.id = orderId;
    }

    if (email && typeof email === 'string') {
      where.subscription = {
        userEmail: {
          contains: email.trim(),
        },
      };
    }

    const invoices = await prisma.invoice.findMany({
      where,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        subscription: {
          include: {
            plan: true,
            inviteCode: true,
          },
        },
      },
    });

    const result = invoices.map((inv) => ({
      id: inv.id,
      status: inv.status,
      priceAmount: inv.amountUsd,
      priceCurrency: 'USD',
      createdAt: inv.createdAt,
      providerPaymentId: inv.providerPaymentId,
      orderId: inv.id, // Using invoice id as orderId since orderId field doesn't exist in schema
      // subscription summary
      subscription: inv.subscription
        ? {
            id: inv.subscription.id,
            userEmail: inv.subscription.userEmail,
            planCode: inv.subscription.plan?.code ?? null,
            status: inv.subscription.status,
            licenseKey: inv.subscription.licenseKey,
            inviteCode: inv.subscription.inviteCode
              ? {
                  id: inv.subscription.inviteCode.id,
                  code: inv.subscription.inviteCode.code,
                  type: inv.subscription.inviteCode.type,
                  ownerEmail: inv.subscription.inviteCode.ownerEmail,
                  revenueSharePercent: inv.subscription.inviteCode.revenueSharePercent ?? 0,
                }
              : null,
          }
        : null,
    }));

    return res.json({ invoices: result });
  } catch (error: any) {
    console.error('[ADMIN Invoices] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/stats
 * Get high-level stats for admin dashboard (admin only)
 */
router.get('/stats', async (req: Request, res: Response, next) => {
  try {
    console.log('[ADMIN Stats] GET /stats');

    // Run subscription counts in parallel
    const [totalSubscriptions, activeSubscriptions, expiredSubscriptions] = await Promise.all([
      prisma.subscription.count(),
      prisma.subscription.count({ where: { status: 'active' } }),
      prisma.subscription.count({ where: { status: 'expired' } }),
    ]);

    // Revenue calculations
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [paidInvoices, allPaidInvoices] = await Promise.all([
      prisma.invoice.findMany({
        where: {
          status: 'paid',
          createdAt: { gte: thirtyDaysAgo },
        },
        select: { amountUsd: true },
      }),
      prisma.invoice.findMany({
        where: { status: 'paid' },
        select: { amountUsd: true },
      }),
    ]);

    const totalPaidInvoices = allPaidInvoices.length;
    const totalRevenueUsd = allPaidInvoices.reduce((sum, inv) => sum + inv.amountUsd, 0);
    const revenueLast30DaysUsd = paidInvoices.reduce((sum, inv) => sum + inv.amountUsd, 0);

    // Breakdown by plan
    const [allPlans, subscriptionsByPlan, invoicesByPlan] = await Promise.all([
      prisma.plan.findMany({
        select: {
          id: true,
          code: true,
          name: true,
          priceUsd: true,
        },
      }),
      prisma.subscription.groupBy({
        by: ['planId', 'status'],
        _count: { _all: true },
      }),
      prisma.invoice.groupBy({
        by: ['planId'],
        where: { status: 'paid' },
        _sum: { amountUsd: true },
      }),
    ]);

    const subscriptionsByPlanMap = new Map<string, { total: number; active: number }>();
    subscriptionsByPlan.forEach((item) => {
      const existing = subscriptionsByPlanMap.get(item.planId) || { total: 0, active: 0 };
      existing.total += item._count._all;
      if (item.status === 'active') {
        existing.active += item._count._all;
      }
      subscriptionsByPlanMap.set(item.planId, existing);
    });

    const revenueByPlanMap = new Map<string, number>();
    invoicesByPlan.forEach((item) => {
      revenueByPlanMap.set(item.planId, item._sum.amountUsd || 0);
    });

    const plansBreakdown = allPlans
      .map((plan) => {
        const subs = subscriptionsByPlanMap.get(plan.id) || { total: 0, active: 0 };
        const revenueUsd = revenueByPlanMap.get(plan.id) || 0;
        return {
          planCode: plan.code,
          name: plan.name,
          priceUsd: plan.priceUsd,
          totalSubscriptions: subs.total,
          activeSubscriptions: subs.active,
          revenueUsd,
        };
      })
      .filter((plan) => plan.totalSubscriptions > 0 || plan.revenueUsd > 0);

    // Breakdown by invite code
    const [inviteCodes, subscriptionsByInvite, revenueByInvite] = await Promise.all([
      prisma.inviteCode.findMany({
        select: {
          id: true,
          code: true,
          type: true,
          status: true,
          maxUses: true,
          usedCount: true,
          ownerEmail: true,
          createdAt: true,
          expiresAt: true,
        },
      }),
      prisma.subscription.groupBy({
        by: ['inviteCodeId', 'status'],
        _count: { _all: true },
        where: {
          inviteCodeId: { not: null },
        },
      }),
      prisma.invoice.groupBy({
        by: ['subscriptionId'],
        where: {
          status: 'paid',
        },
        _sum: { amountUsd: true },
      }),
    ]);

    // Get subscription IDs to inviteCodeId mapping
    const subscriptionsWithInvite = await prisma.subscription.findMany({
      where: {
        inviteCodeId: { not: null },
      },
      select: {
        id: true,
        inviteCodeId: true,
      },
    });

    const subscriptionToInviteMap = new Map<string, string>();
    subscriptionsWithInvite.forEach((sub) => {
      if (sub.inviteCodeId) {
        subscriptionToInviteMap.set(sub.id, sub.inviteCodeId);
      }
    });

    // Aggregate revenue by invite code
    const revenueByInviteMap = new Map<string, number>();
    revenueByInvite.forEach((item) => {
      const inviteCodeId = subscriptionToInviteMap.get(item.subscriptionId);
      if (inviteCodeId) {
        const current = revenueByInviteMap.get(inviteCodeId) || 0;
        revenueByInviteMap.set(inviteCodeId, current + (item._sum.amountUsd || 0));
      }
    });

    // Aggregate subscriptions by invite code
    const subscriptionsByInviteMap = new Map<string, { total: number; active: number }>();
    subscriptionsByInvite.forEach((item) => {
      if (item.inviteCodeId) {
        const existing = subscriptionsByInviteMap.get(item.inviteCodeId) || { total: 0, active: 0 };
        existing.total += item._count._all;
        if (item.status === 'active') {
          existing.active += item._count._all;
        }
        subscriptionsByInviteMap.set(item.inviteCodeId, existing);
      }
    });

    const inviteCodesBreakdown = inviteCodes.map((ic) => {
      const subs = subscriptionsByInviteMap.get(ic.id) || { total: 0, active: 0 };
      const revenueUsd = revenueByInviteMap.get(ic.id) || 0;
      return {
        id: ic.id,
        code: ic.code,
        type: ic.type,
        status: ic.status,
        maxUses: ic.maxUses,
        usedCount: ic.usedCount,
        subscriptionsCount: subs.total,
        activeSubscriptionsCount: subs.active,
        revenueUsd,
        ownerEmail: ic.ownerEmail,
        createdAt: ic.createdAt,
        expiresAt: ic.expiresAt,
      };
    });

    res.json({
      subscriptions: {
        total: totalSubscriptions,
        active: activeSubscriptions,
        expired: expiredSubscriptions,
      },
      revenue: {
        totalPaidInvoices: totalPaidInvoices,
        totalRevenueUsd: totalRevenueUsd,
        revenueLast30DaysUsd: revenueLast30DaysUsd,
      },
      plans: plansBreakdown,
      inviteCodes: inviteCodesBreakdown,
    });
  } catch (error: any) {
    console.error('[ADMIN Stats] Error:', error);
    next(createError('Internal server error', 500));
  }
});

/**
 * GET /api/admin/user-overview
 * Get comprehensive overview for a single user by email (admin only)
 * Query params:
 * - email (required)
 */
router.get('/user-overview', async (req: Request, res: Response, next) => {
  try {
    const email = req.query.email as string | undefined;

    console.log('[ADMIN UserOverview] GET /user-overview', {
      email: email ? '***' : undefined,
    });

    if (!email || typeof email !== 'string') {
      throw createError('Invalid email', 400);
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      throw createError('Invalid email', 400);
    }

    const userEmail = email.trim();

    // Fetch all subscriptions for this user
    const subscriptions = await prisma.subscription.findMany({
      where: { userEmail },
      include: {
        plan: {
          select: {
            id: true,
            code: true,
            name: true,
            priceUsd: true,
          },
        },
        inviteCode: {
          select: {
            id: true,
            code: true,
            type: true,
            status: true,
            ownerEmail: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const subscriptionIds = subscriptions.map((s) => s.id);

    // Fetch all invoices for these subscriptions
    const invoices = await prisma.invoice.findMany({
      where: { subscriptionId: { in: subscriptionIds } },
      select: {
        id: true,
        status: true,
        amountUsd: true,
        createdAt: true,
        paidAt: true,
        planId: true,
        subscriptionId: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Calculate metrics
    const totalSubscriptions = subscriptions.length;
    const activeSubscriptions = subscriptions.filter((s) => s.status === 'active').length;
    const paidInvoices = invoices.filter((inv) => inv.status === 'paid');
    const totalPaidInvoices = paidInvoices.length;
    const totalRevenueUsd = paidInvoices.reduce((sum, inv) => sum + inv.amountUsd, 0);

    // Aggregate plans used
    const plansUsedMap = new Map<string, number>();
    subscriptions.forEach((sub) => {
      const planCode = sub.plan.code;
      plansUsedMap.set(planCode, (plansUsedMap.get(planCode) || 0) + 1);
    });
    const plansUsed = Array.from(plansUsedMap.entries()).map(([planCode, count]) => ({
      planCode,
      count,
    }));

    // Collect unique invite codes
    const inviteCodesMap = new Map<string, {
      id: string;
      code: string;
      type: string;
      status: string;
      ownerEmail: string | null;
    }>();
    subscriptions.forEach((sub) => {
      if (sub.inviteCode) {
        if (!inviteCodesMap.has(sub.inviteCode.id)) {
          inviteCodesMap.set(sub.inviteCode.id, {
            id: sub.inviteCode.id,
            code: sub.inviteCode.code,
            type: sub.inviteCode.type,
            status: sub.inviteCode.status,
            ownerEmail: sub.inviteCode.ownerEmail,
          });
        }
      }
    });

    // Format subscriptions for response (select only useful fields)
    const formattedSubscriptions = subscriptions.map((sub) => ({
      id: sub.id,
      planCode: sub.plan.code,
      planName: sub.plan.name,
      status: sub.status,
      licenseKey: sub.licenseKey,
      startsAt: sub.startsAt?.toISOString() || null,
      expiresAt: sub.expiresAt?.toISOString() || null,
      createdAt: sub.createdAt.toISOString(),
      inviteCodeId: sub.inviteCodeId,
      inviteCode: sub.inviteCode
        ? {
            id: sub.inviteCode.id,
            code: sub.inviteCode.code,
          }
        : null,
    }));

    // Format invoices for response
    const formattedInvoices = invoices.map((inv) => ({
      id: inv.id,
      status: inv.status,
      amountUsd: inv.amountUsd,
      createdAt: inv.createdAt.toISOString(),
      paidAt: inv.paidAt?.toISOString() || null,
      subscriptionId: inv.subscriptionId,
    }));

    res.json({
      userEmail,
      metrics: {
        totalSubscriptions,
        activeSubscriptions,
        totalPaidInvoices,
        totalRevenueUsd,
        plansUsed,
      },
      subscriptions: formattedSubscriptions,
      invoices: formattedInvoices,
      inviteCodes: Array.from(inviteCodesMap.values()),
    });
  } catch (error: any) {
    if (error.statusCode) {
      next(error);
    } else {
      console.error('[ADMIN UserOverview] Error:', error);
      next(createError('Internal server error', 500));
    }
  }
});

export default router;
