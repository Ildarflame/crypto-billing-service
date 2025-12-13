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

export default router;
