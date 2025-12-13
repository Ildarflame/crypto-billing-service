import { getInvoiceById, updateInvoice, generateReceiptNumber } from '../../models/invoiceService';
import { sendEmail } from '../email/emailClient';
import { generateReceiptEmailHtml, generateReceiptEmailText, ReceiptEmailData } from '../email/templates/receipt';
import { getSubscriptionById, updateSubscription } from '../../models/subscriptionService';
import { generateLicenseKey } from '../../utils/licenseKey';
import { createOrExtendLicense } from '../../integrations/shadowInternClient';

/**
 * Sends a receipt email for a paid invoice
 * This function is idempotent - it checks receiptSentAt before sending
 * 
 * @param invoiceId Invoice ID
 * @returns true if email was sent, false if already sent (idempotency)
 * @throws Error if invoice is not found, not paid, or email sending fails
 */
export async function sendReceiptEmail(invoiceId: string): Promise<boolean> {
  // Load invoice with relations
  const invoice = await getInvoiceById(invoiceId);
  if (!invoice) {
    throw new Error(`Invoice not found: ${invoiceId}`);
  }

  // Check if invoice is paid
  if (invoice.status !== 'paid') {
    throw new Error(`Invoice ${invoiceId} is not paid (status: ${invoice.status})`);
  }

  // Idempotency check: if receipt was already sent, return early
  if (invoice.receiptSentAt) {
    console.log(`[Receipt] Invoice ${invoiceId} receipt already sent at ${invoice.receiptSentAt}`);
    return false;
  }

  // Generate receipt number if missing
  let receiptNumber = invoice.receiptNumber;
  if (!receiptNumber) {
    receiptNumber = await generateReceiptNumber();
    await updateInvoice(invoice.id, { receiptNumber });
    console.log(`[Receipt] Generated receipt number ${receiptNumber} for invoice ${invoiceId}`);
  }

  // Ensure paidAt is set
  if (!invoice.paidAt) {
    await updateInvoice(invoice.id, { paidAt: new Date() });
    invoice.paidAt = new Date();
  }

  // Ensure receiptNumber is set (should be set by now, but double-check)
  if (!receiptNumber) {
    receiptNumber = await generateReceiptNumber();
    await updateInvoice(invoice.id, { receiptNumber });
    console.log(`[Receipt] Generated receipt number ${receiptNumber} for invoice ${invoiceId} (fallback)`);
  }

  // Ensure license key exists - generate and sync if missing
  let licenseKey = invoice.subscription.licenseKey;
  let licenseKeySource = 'database';
  
  if (!licenseKey || licenseKey.trim() === '') {
    console.log(`[Receipt] License key missing for subscription ${invoice.subscriptionId}, generating new key`);
    
    // Generate new license key
    licenseKey = generateLicenseKey();
    licenseKeySource = 'generated';
    
    // Get full subscription with plan for Shadow Intern sync
    const subscription = await getSubscriptionById(invoice.subscriptionId);
    if (!subscription) {
      throw new Error(`Subscription not found: ${invoice.subscriptionId}`);
    }
    
    // Persist license key to database
    await updateSubscription(invoice.subscriptionId, {
      licenseKey,
    });
    console.log(`[Receipt] Generated and persisted license key ${licenseKey} for subscription ${invoice.subscriptionId}`);
    
    // Sync with Shadow Intern server
    try {
      // Calculate expiration: use existing expiresAt, or calculate from startsAt + durationDays
      let expiration: Date | null = subscription.expiresAt;
      if (!expiration && subscription.plan.durationDays) {
        const baseDate = subscription.startsAt || new Date();
        expiration = new Date(baseDate.getTime() + subscription.plan.durationDays * 24 * 60 * 60 * 1000);
      }
      
      await createOrExtendLicense({
        userEmail: subscription.userEmail,
        planCode: subscription.plan.code,
        startsAt: subscription.startsAt || new Date(),
        expiresAt: expiration,
        maxRequestsPerDay: subscription.plan.maxRequestsPerDay,
        licenseKey, // Pass the generated key to Shadow Intern
      });
      
      console.log(`[Receipt] Synced license key ${licenseKey} with Shadow Intern server for subscription ${invoice.subscriptionId}`);
    } catch (shadowInternError) {
      // Log error but don't fail receipt sending - license key is already in DB
      console.error(`[Receipt] Failed to sync license key with Shadow Intern server:`, shadowInternError);
      console.log(`[Receipt] License key ${licenseKey} was persisted to database but Shadow Intern sync failed`);
    }
  } else {
    console.log(`[Receipt] Using existing license key from database for subscription ${invoice.subscriptionId}`);
  }

  // Prepare email data
  const emailData: ReceiptEmailData = {
    userEmail: invoice.subscription.userEmail,
    receiptNumber,
    invoiceId: invoice.id,
    subscriptionId: invoice.subscriptionId,
    planCode: invoice.plan.code,
    planName: invoice.plan.name,
    amountUsd: invoice.amountUsd,
    providerPaymentId: invoice.providerPaymentId,
    orderId: invoice.subscriptionId, // Using subscriptionId as orderId
    paidAt: invoice.paidAt!,
    licenseKey: licenseKey || null, // Use the ensured license key
  };
  
  console.log(`[Receipt] License key source: ${licenseKeySource}, key: ${licenseKey ? '***' : 'null'}`);

  // Send email
  try {
    await sendEmail({
      to: invoice.subscription.userEmail,
      subject: `Your Shadow Intern receipt + license key - ${receiptNumber}`,
      html: generateReceiptEmailHtml(emailData),
      text: generateReceiptEmailText(emailData),
    });

    // Mark receipt as sent
    await updateInvoice(invoice.id, {
      receiptSentAt: new Date(),
    });

    console.log(`[Receipt] Successfully sent receipt email for invoice ${invoiceId}`);
    return true;
  } catch (error) {
    console.error(`[Receipt] Failed to send receipt email for invoice ${invoiceId}:`, error);
    // Don't mark receiptSentAt on failure - allow retry
    throw error;
  }
}

