import { Router, Request, Response } from 'express';
import { getSubscriptions } from '../models/subscriptionService';
import { createError } from '../middlewares/errorHandler';

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

export default router;

