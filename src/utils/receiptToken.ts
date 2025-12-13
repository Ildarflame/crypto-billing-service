import crypto from 'crypto';
import { config } from '../config/env';

export interface ReceiptTokenPayload {
  invoiceId: string;
  email: string;
  exp: number; // Unix timestamp
}

/**
 * Creates a signed receipt token for secure PDF download
 * Format: base64url(payload) + '.' + base64url(signature)
 * 
 * @param params Token parameters
 * @returns Signed token string
 */
export function createReceiptToken(params: {
  invoiceId: string;
  email: string;
  expSeconds: number;
}): string {
  const { invoiceId, email, expSeconds } = params;

  if (!config.receipt.tokenSecret) {
    throw new Error('RECEIPT_TOKEN_SECRET is not configured');
  }

  const exp = Math.floor(Date.now() / 1000) + expSeconds;
  const payload: ReceiptTokenPayload = {
    invoiceId,
    email,
    exp,
  };

  // Encode payload as base64url
  const payloadJson = JSON.stringify(payload);
  const payloadBase64 = Buffer.from(payloadJson).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  // Create HMAC signature
  const hmac = crypto.createHmac('sha256', config.receipt.tokenSecret);
  hmac.update(payloadBase64);
  const signature = hmac.digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return `${payloadBase64}.${signature}`;
}

/**
 * Verifies and decodes a receipt token
 * 
 * @param token Signed token string
 * @returns Decoded payload
 * @throws Error if token is invalid or expired
 */
export function verifyReceiptToken(token: string): ReceiptTokenPayload {
  if (!config.receipt.tokenSecret) {
    throw new Error('RECEIPT_TOKEN_SECRET is not configured');
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    throw new Error('Invalid token format');
  }

  const [payloadBase64, providedSignature] = parts;

  // Verify signature
  const hmac = crypto.createHmac('sha256', config.receipt.tokenSecret);
  hmac.update(payloadBase64);
  const computedSignature = hmac.digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  // Timing-safe comparison
  if (computedSignature.length !== providedSignature.length) {
    throw new Error('Invalid token signature');
  }

  const computedBuffer = Buffer.from(computedSignature, 'utf8');
  const providedBuffer = Buffer.from(providedSignature, 'utf8');

  if (!crypto.timingSafeEqual(computedBuffer, providedBuffer)) {
    throw new Error('Invalid token signature');
  }

  // Decode payload
  let payloadJson: string;
  try {
    // Add padding if needed
    const padded = payloadBase64 + '='.repeat((4 - (payloadBase64.length % 4)) % 4);
    const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
    payloadJson = Buffer.from(base64, 'base64').toString('utf8');
  } catch (error) {
    throw new Error('Invalid token payload encoding');
  }

  let payload: ReceiptTokenPayload;
  try {
    payload = JSON.parse(payloadJson);
  } catch (error) {
    throw new Error('Invalid token payload format');
  }

  // Verify expiration
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) {
    throw new Error('Token expired');
  }

  return payload;
}

