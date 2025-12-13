import prisma from '../db/prisma';
import type { InviteCodeStatus } from '../types/invite';

export interface InviteCodeValidationError {
  code: 'NOT_FOUND' | 'NOT_ACTIVE' | 'EXPIRED' | 'LIMIT_REACHED';
  message: string;
}

/**
 * Validates an invite code and returns the InviteCode entity if valid.
 * Throws an error object if validation fails.
 */
export async function validateInviteCodeOrThrow(
  code: string
): Promise<any> {
  // Normalize code: trim and lowercase
  const normalized = code.trim().toLowerCase();

  if (!normalized) {
    throw {
      code: 'NOT_FOUND' as const,
      message: 'Invite code is required',
    } as InviteCodeValidationError;
  }

  // Look up by code
  // @ts-expect-error - Prisma client will be generated after migration
  const invite = await prisma.inviteCode.findUnique({
    where: { code: normalized },
  });

  if (!invite) {
    throw {
      code: 'NOT_FOUND' as const,
      message: 'Invite code is invalid',
    } as InviteCodeValidationError;
  }

  // Check status
  const activeStatus: InviteCodeStatus = 'ACTIVE';
  if (invite.status !== activeStatus) {
    throw {
      code: 'NOT_ACTIVE' as const,
      message: 'Invite code is not active',
    } as InviteCodeValidationError;
  }

  // Check expiration
  if (invite.expiresAt && invite.expiresAt < new Date()) {
    throw {
      code: 'EXPIRED' as const,
      message: 'Invite code has expired',
    } as InviteCodeValidationError;
  }

  // Check usage limit
  if (invite.maxUses !== null && invite.usedCount >= invite.maxUses) {
    throw {
      code: 'LIMIT_REACHED' as const,
      message: 'Invite code usage limit has been reached',
    } as InviteCodeValidationError;
  }

  return invite;
}

