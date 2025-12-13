import { config } from '../../config/env';

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Sends an email using the configured provider (Resend or SMTP)
 * 
 * @param params Email parameters
 * @returns Promise that resolves when email is sent
 * @throws Error if email sending fails
 */
export async function sendEmail(params: SendEmailParams): Promise<void> {
  const { to, subject, html, text } = params;
  const provider = config.email.provider;

  console.log('[Email] Sending email', {
    provider,
    to: to.substring(0, 3) + '***',
    subject,
  });

  if (provider === 'resend') {
    await sendEmailViaResend({ to, subject, html, text });
  } else if (provider === 'smtp') {
    await sendEmailViaSMTP({ to, subject, html, text });
  } else {
    throw new Error(`Unsupported email provider: ${provider}`);
  }

  console.log('[Email] Email sent successfully', {
    provider,
    to: to.substring(0, 3) + '***',
  });
}

/**
 * Sends email via Resend API
 */
async function sendEmailViaResend(params: SendEmailParams): Promise<void> {
  const { to, subject, html, text } = params;

  if (!config.email.resend.apiKey) {
    throw new Error('RESEND_API_KEY is not configured');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.email.resend.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: config.email.from,
        to: [to],
        subject,
        html,
        text: text || html.replace(/<[^>]*>/g, ''), // Strip HTML tags for text version
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Resend API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json() as { id?: string };
    console.log('[Email] Resend response:', { id: data.id });
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Email send timeout (10s)');
    }
    throw error;
  }
}

/**
 * Sends email via SMTP using nodemailer
 * Note: This requires nodemailer to be installed: npm install nodemailer @types/nodemailer
 */
async function sendEmailViaSMTP(params: SendEmailParams): Promise<void> {
  const { to, subject, html, text } = params;

  // Dynamic import to avoid requiring nodemailer if using Resend
  const nodemailer = await import('nodemailer');

  if (!config.email.smtp.host || !config.email.smtp.user || !config.email.smtp.pass) {
    throw new Error('SMTP configuration is incomplete (SMTP_HOST, SMTP_USER, SMTP_PASS required)');
  }

  const transporter = nodemailer.createTransport({
    host: config.email.smtp.host,
    port: config.email.smtp.port,
    secure: config.email.smtp.port === 465, // true for 465, false for other ports
    auth: {
      user: config.email.smtp.user,
      pass: config.email.smtp.pass,
    },
    // Timeout settings
    connectionTimeout: 10000, // 10 seconds
    greetingTimeout: 10000,
    socketTimeout: 10000,
  });

  try {
    const info = await transporter.sendMail({
      from: config.email.from,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ''),
    });

    console.log('[Email] SMTP response:', { messageId: info.messageId });
  } catch (error) {
    console.error('[Email] SMTP error:', error);
    throw error;
  }
}

