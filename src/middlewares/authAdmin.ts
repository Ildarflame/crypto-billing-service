import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env';

/**
 * Admin authentication middleware.
 * Accepts token from either:
 * - X-Admin-Token header
 * - Authorization: Bearer <token>
 */
export function authAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Try X-Admin-Token header first
  let adminToken = req.headers['x-admin-token'] as string | undefined;

  // If not found, try Authorization Bearer header
  if (!adminToken) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      adminToken = authHeader.substring(7);
    }
  }

  if (!adminToken || adminToken !== config.adminApiToken) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}

