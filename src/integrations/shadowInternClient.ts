import { config } from '../config/env';
import {
  CreateOrExtendLicenseParams,
  CreateOrExtendLicenseResponse,
} from '../types/api';

/**
 * Creates or extends a license key on the Shadow Intern server.
 * 
 * TODO: Adjust the endpoint URL and request/response format based on actual Shadow Intern API documentation.
 * This is a placeholder implementation that assumes a REST API structure.
 */
interface ShadowInternLicenseApiResponse {
  licenseKey?: string;
  license_key?: string;
  key?: string;
  plan?: string;
  expiresAt?: string;
  expires_at?: string;
  limitPerDay?: number;
  limit_per_day?: number;
}
export async function createOrExtendLicense(
  params: CreateOrExtendLicenseParams
): Promise<CreateOrExtendLicenseResponse> {
  const { userEmail, planCode, startsAt, expiresAt, maxRequestsPerDay } =
    params;

  if (!config.shadowIntern.baseUrl || !config.shadowIntern.adminToken) {
    throw new Error('Shadow Intern configuration is missing');
  }

  try {
    // TODO: Verify the actual Shadow Intern admin API endpoint
    // This assumes POST /admin/license/upsert or similar
    const response = await fetch(
      `${config.shadowIntern.baseUrl}/admin/license/upsert`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.shadowIntern.adminToken}`,
          // TODO: Adjust header format if Shadow Intern uses different auth
        },
        body: JSON.stringify({
          userEmail,
          planCode,
          startsAt: startsAt.toISOString(),
          expiresAt: expiresAt ? expiresAt.toISOString() : null,
          maxRequestsPerDay,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      const error = new Error(
        `Shadow Intern API error: ${response.status} ${response.statusText} - ${errorText}`
      );
      console.error('Failed to create/extend license:', error);
      throw error;
    }

    const data = await response.json() as ShadowInternLicenseApiResponse;

    // TODO: Adjust these field names based on actual Shadow Intern response structure
    return {
      licenseKey: data.licenseKey || data.license_key || data.key || '',
      plan: data.plan || planCode,
      expiresAt: data.expiresAt || data.expires_at || (expiresAt ? expiresAt.toISOString() : null),
      limitPerDay: data.limitPerDay || data.limit_per_day || maxRequestsPerDay,
    };
  } catch (error) {
    console.error('Error calling Shadow Intern admin API:', error);
    // Re-throw to allow caller to handle (e.g., mark subscription as payment_received_but_license_failed)
    throw error;
  }
}

