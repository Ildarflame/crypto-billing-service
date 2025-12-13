import { config } from '../../../config/env';
import { createReceiptToken } from '../../../utils/receiptToken';

export interface ReceiptEmailData {
  userEmail: string;
  receiptNumber: string;
  invoiceId: string;
  subscriptionId: string;
  planCode: string;
  planName: string;
  amountUsd: number;
  providerPaymentId: string | null;
  orderId: string | null;
  paidAt: Date;
  licenseKey: string | null;
}

/**
 * Generates HTML email template for receipt
 */
export function generateReceiptEmailHtml(data: ReceiptEmailData): string {
  const {
    userEmail,
    receiptNumber,
    invoiceId,
    subscriptionId,
    planCode,
    planName,
    amountUsd,
    providerPaymentId,
    orderId,
    paidAt,
    licenseKey,
  } = data;

  const receiptDownloadUrl = generateReceiptDownloadUrl(invoiceId, userEmail);
  const successUrl = `https://www.shadowintern.xyz/success?subscriptionId=${subscriptionId}&email=${encodeURIComponent(userEmail)}`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Shadow Intern Receipt</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0a0a0a; color: #e5e5e5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a0a; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #1a1a1a; border-radius: 8px; overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 30px; text-align: center; border-bottom: 1px solid #2a2a2a;">
              <h1 style="margin: 0; font-size: 28px; font-weight: 600; color: #ffffff;">Shadow Intern</h1>
              <p style="margin: 10px 0 0; font-size: 16px; color: #999;">Payment Receipt</p>
            </td>
          </tr>
          
          <!-- License Key Section -->
          <tr>
            <td style="padding: 30px 40px; background-color: #1f1f1f; border-bottom: 1px solid #2a2a2a;">
              <h2 style="margin: 0 0 15px; font-size: 18px; font-weight: 600; color: #ffffff;">Your License Key</h2>
              ${licenseKey ? `
              <div style="background-color: #0a0a0a; padding: 20px; border-radius: 6px; border: 1px solid #2a2a2a;">
                <code style="font-size: 20px; font-weight: 600; color: #4ade80; letter-spacing: 1px; font-family: 'Courier New', monospace;">${licenseKey}</code>
              </div>
              <p style="margin: 20px 0 0; font-size: 14px; color: #999; line-height: 1.6;">
                <strong>How to use:</strong><br>
                1. Install the Shadow Intern browser extension<br>
                2. Open the extension settings<br>
                3. Paste your license key above<br>
                4. Start using Shadow Intern!
              </p>
              ` : `
              <div style="background-color: #0a0a0a; padding: 20px; border-radius: 6px; border: 1px solid #2a2a2a;">
                <p style="margin: 0; font-size: 14px; color: #ffa500; line-height: 1.6;">
                  <strong>License key is activating...</strong><br>
                  Your license key is being generated and will be available shortly. If you don't receive it within a few minutes, please contact support.
                </p>
              </div>
              `}
              <p style="margin: 15px 0 0;">
                <a href="https://www.shadowintern.xyz/setup" style="display: inline-block; padding: 12px 24px; background-color: #4ade80; color: #0a0a0a; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">View Installation Instructions</a>
              </p>
            </td>
          </tr>
          
          <!-- Receipt Details -->
          <tr>
            <td style="padding: 30px 40px;">
              <h2 style="margin: 0 0 20px; font-size: 18px; font-weight: 600; color: #ffffff;">Receipt Details</h2>
              
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
                <tr>
                  <td style="padding: 8px 0; font-size: 14px; color: #999;">Receipt Number:</td>
                  <td style="padding: 8px 0; font-size: 14px; color: #ffffff; text-align: right; font-weight: 600;">${receiptNumber}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-size: 14px; color: #999;">Invoice ID:</td>
                  <td style="padding: 8px 0; font-size: 14px; color: #ffffff; text-align: right; font-family: monospace;">${invoiceId.substring(0, 12)}...</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-size: 14px; color: #999;">Subscription ID:</td>
                  <td style="padding: 8px 0; font-size: 14px; color: #ffffff; text-align: right; font-family: monospace;">${subscriptionId.substring(0, 12)}...</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-size: 14px; color: #999;">Plan:</td>
                  <td style="padding: 8px 0; font-size: 14px; color: #ffffff; text-align: right; font-weight: 600;">${planName} (${planCode})</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-size: 14px; color: #999;">Amount:</td>
                  <td style="padding: 8px 0; font-size: 16px; color: #4ade80; text-align: right; font-weight: 600;">$${amountUsd.toFixed(2)} USD</td>
                </tr>
                ${providerPaymentId ? `
                <tr>
                  <td style="padding: 8px 0; font-size: 14px; color: #999;">Payment ID:</td>
                  <td style="padding: 8px 0; font-size: 14px; color: #ffffff; text-align: right; font-family: monospace;">${providerPaymentId}</td>
                </tr>
                ` : ''}
                ${orderId ? `
                <tr>
                  <td style="padding: 8px 0; font-size: 14px; color: #999;">Order ID:</td>
                  <td style="padding: 8px 0; font-size: 14px; color: #ffffff; text-align: right; font-family: monospace;">${orderId}</td>
                </tr>
                ` : ''}
                <tr>
                  <td style="padding: 8px 0; font-size: 14px; color: #999;">Paid At:</td>
                  <td style="padding: 8px 0; font-size: 14px; color: #ffffff; text-align: right;">${paidAt.toLocaleString('en-US', { timeZone: 'UTC' })} UTC</td>
                </tr>
              </table>
              
              <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #2a2a2a;">
                <p style="margin: 0 0 15px; font-size: 14px; color: #999;">
                  <a href="${receiptDownloadUrl}" style="color: #4ade80; text-decoration: none; font-weight: 600;">Download Receipt PDF</a>
                </p>
                <p style="margin: 0; font-size: 14px; color: #999;">
                  <a href="${successUrl}" style="color: #4ade80; text-decoration: none;">View Success Page</a>
                </p>
              </div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background-color: #1f1f1f; border-top: 1px solid #2a2a2a; text-align: center;">
              <p style="margin: 0 0 10px; font-size: 14px; color: #999;">Need help? Contact us:</p>
              <p style="margin: 0; font-size: 14px; color: #999;">
                <a href="https://t.me/shadowintern" style="color: #4ade80; text-decoration: none;">Telegram</a> | 
                <a href="https://x.com/shadowintern" style="color: #4ade80; text-decoration: none;">X (Twitter)</a>
              </p>
              <p style="margin: 20px 0 0; font-size: 12px; color: #666;">
                This is an automated receipt. Please keep this email for your records.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Generates plain text version of receipt email
 */
export function generateReceiptEmailText(data: ReceiptEmailData): string {
  const {
    userEmail,
    receiptNumber,
    invoiceId,
    subscriptionId,
    planCode,
    planName,
    amountUsd,
    providerPaymentId,
    orderId,
    paidAt,
    licenseKey,
  } = data;

  const receiptDownloadUrl = generateReceiptDownloadUrl(invoiceId, userEmail);
  const successUrl = `https://www.shadowintern.xyz/success?subscriptionId=${subscriptionId}&email=${encodeURIComponent(userEmail)}`;

  let text = `Shadow Intern - Payment Receipt\n`;
  text += `================================\n\n`;

  text += `Your License Key:\n`;
  if (licenseKey) {
    text += `${licenseKey}\n\n`;
    text += `How to use:\n`;
    text += `1. Install the Shadow Intern browser extension\n`;
    text += `2. Open the extension settings\n`;
    text += `3. Paste your license key above\n`;
    text += `4. Start using Shadow Intern!\n\n`;
  } else {
    text += `License key is activating...\n`;
    text += `Your license key is being generated and will be available shortly. If you don't receive it within a few minutes, please contact support.\n\n`;
  }
  text += `Installation Instructions: https://www.shadowintern.xyz/setup\n\n`;

  text += `Receipt Details:\n`;
  text += `----------------\n`;
  text += `Receipt Number: ${receiptNumber}\n`;
  text += `Invoice ID: ${invoiceId}\n`;
  text += `Subscription ID: ${subscriptionId}\n`;
  text += `Plan: ${planName} (${planCode})\n`;
  text += `Amount: $${amountUsd.toFixed(2)} USD\n`;
  if (providerPaymentId) {
    text += `Payment ID: ${providerPaymentId}\n`;
  }
  if (orderId) {
    text += `Order ID: ${orderId}\n`;
  }
  text += `Paid At: ${paidAt.toLocaleString('en-US', { timeZone: 'UTC' })} UTC\n\n`;

  text += `Download Receipt PDF: ${receiptDownloadUrl}\n`;
  text += `View Success Page: ${successUrl}\n\n`;

  text += `Need help? Contact us:\n`;
  text += `Telegram: https://t.me/shadowintern\n`;
  text += `X (Twitter): https://x.com/shadowintern\n\n`;

  text += `This is an automated receipt. Please keep this email for your records.\n`;

  return text;
}

/**
 * Generates a signed receipt download URL
 */
function generateReceiptDownloadUrl(invoiceId: string, userEmail: string): string {
  const baseUrl = config.billing.publicBaseUrl.replace(/\/$/, '');
  const token = createReceiptToken({
    invoiceId,
    email: userEmail,
    expSeconds: config.receipt.tokenTtlSeconds,
  });
  return `${baseUrl}/api/billing/receipt/${invoiceId}?token=${encodeURIComponent(token)}`;
}

