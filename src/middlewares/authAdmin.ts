import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env';
import { createError } from './errorHandler';

export function authAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const adminToken = req.headers['x-admin-token'] as string;

  if (!adminToken || adminToken !== config.adminApiToken) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}

