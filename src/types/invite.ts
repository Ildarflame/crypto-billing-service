/**
 * InviteCode type definitions for SQLite compatibility.
 * Since SQLite doesn't support Prisma enums, we use string unions in TypeScript.
 */

export type InviteCodeType = "INVITE" | "REFERRAL" | "PARTNER";
export type InviteCodeStatus = "ACTIVE" | "PAUSED" | "EXPIRED";

/**
 * Valid invite code types as an array for validation
 */
export const VALID_INVITE_CODE_TYPES: InviteCodeType[] = ["INVITE", "REFERRAL", "PARTNER"];

/**
 * Valid invite code statuses as an array for validation
 */
export const VALID_INVITE_CODE_STATUSES: InviteCodeStatus[] = ["ACTIVE", "PAUSED", "EXPIRED"];

