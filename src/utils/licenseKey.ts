import crypto from 'crypto';

/**
 * Generates a license key in the format shadow-<random hex>
 * Matches the format used by Shadow Intern server (shadow-xxxx where xxxx is 8 hex characters)
 * 
 * @returns License key string (e.g., "shadow-a1b2c3d4")
 */
export function generateLicenseKey(): string {
  // Generate 4 random bytes (8 hex characters) to match Shadow Intern server format
  const randomBytes = crypto.randomBytes(4);
  const hexString = randomBytes.toString('hex');
  return `shadow-${hexString}`;
}

