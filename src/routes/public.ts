import { Router, Request, Response } from 'express';
import prisma from '../db/prisma';

const router = Router();

/**
 * GET /api/billing/subscription-status
 * Get subscription status and licenseKey by subscriptionId and email
 */
router.get('/api/billing/subscription-status', async (req: Request, res: Response) => {
  try {
    const { subscriptionId, email } = req.query as {
      subscriptionId?: string;
      email?: string;
    };

    if (!subscriptionId || !email) {
      return res.status(400).json({ error: 'subscriptionId and email required' });
    }

    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true },
    });

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    if (subscription.userEmail.toLowerCase() !== email.toLowerCase()) {
      return res.status(403).json({ error: 'Email does not match this subscription' });
    }

    return res.json({
      id: subscription.id,
      status: subscription.status,
      planCode: subscription.plan.code,
      licenseKey: subscription.licenseKey ?? null,
      expiresAt: subscription.expiresAt?.toISOString() ?? null,
    });
  } catch (err) {
    console.error('subscription-status error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
