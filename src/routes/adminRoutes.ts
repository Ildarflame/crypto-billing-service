import { Router, Request, Response } from 'express';
import { createError } from '../middlewares/errorHandler';
import prisma from '../db/prisma';
import type { InviteCodeType, InviteCodeStatus } from '../types/invite';
import { VALID_INVITE_CODE_TYPES, VALID_INVITE_CODE_STATUSES } from '../types/invite';

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
    const { code, type, maxUses, expiresAt, ownerEmail, notes } = req.body;

    console.log('[ADMIN Invite] POST /invite-codes', {
      code: code ? '***' : undefined,
      type,
      maxUses,
      ownerEmail: ownerEmail ? '***' : undefined,
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

    const inviteCode = await prisma.inviteCode.create({
      data: {
        code: normalizedCode,
        type: inviteType,
        status: 'ACTIVE', // Default status
        maxUses: maxUsesInt,
        expiresAt: expiresAtDate,
        ownerEmail: ownerEmail || null,
        notes: notes || null,
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
    const { status, maxUses, notes } = req.body;

    console.log('[ADMIN Invite] PATCH /invite-codes/:id', {
      id,
      status,
      maxUses,
      hasNotes: !!notes,
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
 * - limit (default 50, max 200)
 */
router.get('/subscriptions', async (req: Request, res: Response, next) => {
  try {
    const email = req.query.email as string | undefined;
    const status = req.query.status as string | undefined;
    const planCode = req.query.planCode as string | undefined;
    const limit = Math.min(
      parseInt(req.query.limit as string) || 50,
      200
    );

    console.log('[ADMIN Subscriptions] GET /subscriptions', {
      email: email ? '***' : undefined,
      status,
      planCode,
      limit,
    });

    const where: any = {};

    if (email) {
      const emailSearch = email.trim();
      // SQLite: use contains filter for email search
      where.userEmail = {
        contains: emailSearch,
      };
    }

    if (status) {
      where.status = status;
    }

    if (planCode) {
      where.plan = {
        code: planCode.trim(),
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
    const plans = await prisma.plan.findMany({
      include: {
        subscriptions: {
          select: { id: true, status: true },
        },
        invoices: {
          where: { status: 'paid' },
          select: { amountUsd: true },
        },
      },
    });

    const plansBreakdown = plans
      .filter((plan) => plan.subscriptions.length > 0 || plan.invoices.length > 0)
      .map((plan) => {
        const activeSubs = plan.subscriptions.filter((s) => s.status === 'active').length;
        const revenueUsd = plan.invoices.reduce((sum, inv) => sum + inv.amountUsd, 0);
        return {
          planCode: plan.code,
          name: plan.name,
          priceUsd: plan.priceUsd,
          totalSubscriptions: plan.subscriptions.length,
          activeSubscriptions: activeSubs,
          revenueUsd,
        };
      });

    // Breakdown by invite code
    const inviteCodes = await prisma.inviteCode.findMany({
      include: {
        subscriptions: {
          select: { id: true, status: true },
          include: {
            invoices: {
              where: { status: 'paid' },
              select: { amountUsd: true },
            },
          },
        },
      },
    });

    const inviteCodesBreakdown = inviteCodes.map((ic) => {
      const activeSubs = ic.subscriptions.filter((s) => s.status === 'active').length;
      const revenueUsd = ic.subscriptions.reduce(
        (sum, sub) => sum + sub.invoices.reduce((invSum, inv) => invSum + inv.amountUsd, 0),
        0
      );
      return {
        id: ic.id,
        code: ic.code,
        type: ic.type,
        status: ic.status,
        maxUses: ic.maxUses,
        usedCount: ic.usedCount,
        subscriptionsCount: ic.subscriptions.length,
        activeSubscriptionsCount: activeSubs,
        revenueUsd,
        ownerEmail: ic.ownerEmail,
        createdAt: ic.createdAt.toISOString(),
        expiresAt: ic.expiresAt?.toISOString() || null,
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
