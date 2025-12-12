import { Router, Request, Response } from 'express';
import { validateInviteCodeOrThrow } from '../services/inviteCodeService';

const router = Router();

/**
 * POST /api/invite/validate
 * Validate an invite code
 */
router.post('/api/invite/validate', async (req: Request, res: Response) => {
  try {
    const { code } = req.body;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({
        ok: false,
        error: 'Invite code is required',
      });
    }

    try {
      const inviteCode = await validateInviteCodeOrThrow(code);

      return res.status(200).json({
        ok: true,
        code: inviteCode.code,
        type: inviteCode.type,
        status: inviteCode.status,
        maxUses: inviteCode.maxUses,
        usedCount: inviteCode.usedCount,
        expiresAt: inviteCode.expiresAt?.toISOString() || null,
      });
    } catch (validationError: any) {
      // Handle validation errors
      if (validationError.code) {
        return res.status(400).json({
          ok: false,
          error: validationError.message || 'Invite code is invalid or expired',
          reason: validationError.code,
        });
      }
      throw validationError; // Re-throw unexpected errors
    }
  } catch (error) {
    console.error('[POST /api/invite/validate] Error:', error);
    return res.status(500).json({
      ok: false,
      error: 'Internal server error',
    });
  }
});

export default router;
