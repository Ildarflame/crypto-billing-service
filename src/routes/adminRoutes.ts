import { Router, Request, Response } from 'express';
import { getSubscriptions } from '../models/subscriptionService';
import { createError } from '../middlewares/errorHandler';
import prisma from '../db/prisma';
import type { InviteCodeType, InviteCodeStatus } from '../types/invite';
import { VALID_INVITE_CODE_TYPES, VALID_INVITE_CODE_STATUSES } from '../types/invite';

const router = Router();

/**
 * GET /api/admin/subscriptions
 * Get paginated list of subscriptions (admin only)
 */
router.get('/subscriptions', async (req: Request, res: Response, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;

    if (page < 1) {
      throw createError('Page must be >= 1', 400);
    }
    if (limit < 1 || limit > 100) {
      throw createError('Limit must be between 1 and 100', 400);
    }

    const { subscriptions, total } = await getSubscriptions({ page, limit });

    res.json({
      subscriptions: subscriptions.map((sub) => ({
        id: sub.id,
        userEmail: sub.userEmail,
        productCode: sub.productCode,
        planCode: sub.plan.code,
        planName: sub.plan.name,
        status: sub.status,
        licenseKey: sub.licenseKey,
        startsAt: sub.startsAt,
        expiresAt: sub.expiresAt,
        createdAt: sub.createdAt,
        updatedAt: sub.updatedAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/invite-codes
 * Get list of invite codes (admin only)
 */
router.get('/invite-codes', async (req: Request, res: Response, next) => {
  try {
    const code = req.query.code as string | undefined;
    const status = req.query.status as string | undefined;

    const where: any = {};
    if (code) {
      where.code = code.trim().toLowerCase();
    }
    if (status) {
      where.status = status.toUpperCase();
    }

    // @ts-ignore - Prisma client will be generated after migration
    const inviteCodes = await prisma.inviteCode.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      inviteCodes: inviteCodes.map((ic: any) => ({
        id: ic.id,
        code: ic.code,
        type: ic.type,
        status: ic.status,
        maxUses: ic.maxUses,
        usedCount: ic.usedCount,
        expiresAt: ic.expiresAt?.toISOString() || null,
        ownerEmail: ic.ownerEmail,
        notes: ic.notes,
        createdAt: ic.createdAt.toISOString(),
        updatedAt: ic.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/invite-codes
 * Create a new invite code (admin only)
 */
router.post('/invite-codes', async (req: Request, res: Response, next) => {
  try {
    const { code, type, maxUses, expiresAt, ownerEmail, notes } = req.body;

    if (!code || typeof code !== 'string') {
      throw createError('Code is required', 400);
    }

    // Normalize code: trim and lowercase
    const normalizedCode = code.trim().toLowerCase();

    if (!normalizedCode) {
      throw createError('Code cannot be empty', 400);
    }

    // Check if code already exists
    // @ts-ignore - Prisma client will be generated after migration
    const existing = await prisma.inviteCode.findUnique({
      where: { code: normalizedCode },
    });

    if (existing) {
      throw createError('Invite code already exists', 400);
    }

    // Validate type if provided
    const inviteType: InviteCodeType = type && VALID_INVITE_CODE_TYPES.includes(type.toUpperCase() as InviteCodeType)
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

    // @ts-ignore - Prisma client will be generated after migration
    const inviteCode = await prisma.inviteCode.create({
      data: {
        code: normalizedCode,
        type: inviteType,
        maxUses: maxUsesInt,
        expiresAt: expiresAtDate,
        ownerEmail: ownerEmail || null,
        notes: notes || null,
      },
    });

    res.status(201).json({
      id: inviteCode.id,
      code: inviteCode.code,
      type: inviteCode.type,
      status: inviteCode.status,
      maxUses: inviteCode.maxUses,
      usedCount: inviteCode.usedCount,
      expiresAt: inviteCode.expiresAt?.toISOString() || null,
      ownerEmail: inviteCode.ownerEmail,
      notes: inviteCode.notes,
      createdAt: inviteCode.createdAt.toISOString(),
      updatedAt: inviteCode.updatedAt.toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/admin/invite-codes/:id
 * Update an invite code (admin only)
 */
router.patch('/invite-codes/:id', async (req: Request, res: Response, next) => {
  try {
    const { id } = req.params;
    const { status, maxUses, expiresAt, ownerEmail, notes } = req.body;

    // Check if invite code exists
    // @ts-ignore - Prisma client will be generated after migration
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
        throw createError('Invalid status. Must be one of: ACTIVE, PAUSED, EXPIRED', 400);
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

    if (expiresAt !== undefined) {
      if (expiresAt === null) {
        updateData.expiresAt = null;
      } else {
        const expiresAtDate = new Date(expiresAt);
        if (isNaN(expiresAtDate.getTime())) {
          throw createError('Invalid expiresAt date format', 400);
        }
        updateData.expiresAt = expiresAtDate;
      }
    }

    if (ownerEmail !== undefined) {
      updateData.ownerEmail = ownerEmail || null;
    }

    if (notes !== undefined) {
      updateData.notes = notes || null;
    }

    // @ts-ignore - Prisma client will be generated after migration
    const updated = await prisma.inviteCode.update({
      where: { id },
      data: updateData,
    });

    res.json({
      id: updated.id,
      code: updated.code,
      type: updated.type,
      status: updated.status,
      maxUses: updated.maxUses,
      usedCount: updated.usedCount,
      expiresAt: updated.expiresAt?.toISOString() || null,
      ownerEmail: updated.ownerEmail,
      notes: updated.notes,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

export default router;

