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

/**
 * Updates a license on the Shadow Intern server when an admin modifies a subscription.
 * This function is defensive and never throws - it only logs errors to avoid breaking the billing flow.
 */
export async function updateLicenseFromSubscription(params: {
  subscriptionId: string;
  userEmail: string;
  licenseKey?: string | null;
  status?: string;
  expiresAt?: Date | null;
  addDays?: number;
  maxRequests?: number | null;
}): Promise<void> {
  const { subscriptionId, userEmail, licenseKey, status, expiresAt, addDays, maxRequests } = params;

  console.log('[ShadowIntern] updateLicenseFromSubscription called', {
    subscriptionId,
    userEmail: userEmail ? '***' : undefined,
    hasLicenseKey: !!licenseKey,
    status,
    expiresAt: expiresAt ? expiresAt.toISOString() : undefined,
    addDays,
    maxRequests,
  });

  // If Shadow Intern is not configured, log and return
  if (!config.shadowIntern.baseUrl || !config.shadowIntern.adminToken) {
    console.log('[ShadowIntern] License update skipped: Shadow Intern configuration is missing (baseUrl or adminToken)');
    return;
  }

  // If no licenseKey is provided, log and return
  if (!licenseKey) {
    console.log('[ShadowIntern] License update skipped: No licenseKey provided for subscription', subscriptionId);
    return;
  }

  try {
    // Build request body with only provided fields (exclude undefined)
    const body: any = {
      subscriptionId,
      userEmail,
      licenseKey,
    };

    if (status !== undefined) {
      body.status = status;
    }

    if (expiresAt !== undefined) {
      body.expiresAt = expiresAt ? expiresAt.toISOString() : null;
    }

    if (addDays !== undefined) {
      body.addDays = addDays;
    }

    if (maxRequests !== undefined) {
      body.maxRequests = maxRequests;
    }

    const url = `${config.shadowIntern.baseUrl}/admin/license/update`;
    console.log('[ShadowIntern] Sending license update request', {
      url,
      subscriptionId,
      status,
      hasExpiresAt: !!expiresAt,
      addDays,
      maxRequests,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Token': config.shadowIntern.adminToken,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[ShadowIntern] License update failed', {
        subscriptionId,
        statusCode: response.status,
        statusText: response.statusText,
        responseBody: errorText,
        licenseKey: licenseKey ? '***' : undefined,
      });
      return;
    }

    const responseData = await response.json();
    console.log('[ShadowIntern] License update succeeded', {
      subscriptionId,
      statusCode: response.status,
      licenseKey: licenseKey ? '***' : undefined,
      responseData: responseData ? 'received' : 'empty',
    });
  } catch (error) {
    console.error('[ShadowIntern] License update error', {
      subscriptionId,
      error: error instanceof Error ? error.message : String(error),
      licenseKey: licenseKey ? '***' : undefined,
    });
    // Never throw - we don't want to break the billing flow
  }
}

