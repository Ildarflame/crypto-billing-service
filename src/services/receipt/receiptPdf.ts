import PDFDocument from 'pdfkit';
import { ReceiptEmailData } from '../email/templates/receipt';

/**
 * Generates a PDF receipt as a Buffer
 * 
 * @param data Receipt data
 * @returns PDF buffer
 */
export function generateReceiptPdf(data: ReceiptEmailData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
      });

      const buffers: Buffer[] = [];

      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const {
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

      // Header
      doc.fontSize(24).text('Shadow Intern', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(16).text('Payment Receipt', { align: 'center' });
      doc.moveDown(2);

      // License Key Section (if available)
      if (licenseKey) {
        doc.fontSize(14).text('License Key:', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(18).font('Courier').text(licenseKey, {
          align: 'center',
          fill: true,
          backgroundColor: '#f0f0f0',
          padding: 10,
        });
        doc.font('Helvetica').fontSize(10);
        doc.moveDown(1);
        doc.text('How to use:', { underline: true });
        doc.fontSize(9).text('1. Install the Shadow Intern browser extension', { indent: 10 });
        doc.text('2. Open the extension settings', { indent: 10 });
        doc.text('3. Paste your license key above', { indent: 10 });
        doc.text('4. Start using Shadow Intern!', { indent: 10 });
        doc.moveDown(2);
      }

      // Receipt Details
      doc.fontSize(14).text('Receipt Details', { underline: true });
      doc.moveDown(0.5);

      const details = [
        ['Receipt Number:', receiptNumber],
        ['Invoice ID:', invoiceId.substring(0, 20) + '...'],
        ['Subscription ID:', subscriptionId.substring(0, 20) + '...'],
        ['Plan:', `${planName} (${planCode})`],
        ['Amount:', `$${amountUsd.toFixed(2)} USD`],
      ];

      if (providerPaymentId) {
        details.push(['Payment ID:', providerPaymentId]);
      }
      if (orderId) {
        details.push(['Order ID:', orderId]);
      }
      details.push(['Paid At:', paidAt.toLocaleString('en-US', { timeZone: 'UTC' }) + ' UTC']);

      // Draw details table
      let y = doc.y;
      const lineHeight = 20;
      const labelWidth = 150;
      const valueWidth = 350;

      details.forEach(([label, value]) => {
        doc.fontSize(10).fillColor('#666666').text(label, 50, y, { width: labelWidth });
        doc.fillColor('#000000').text(value, 200, y, { width: valueWidth });
        y += lineHeight;
      });

      doc.moveDown(2);

      // Footer
      doc.fontSize(9).fillColor('#666666').text(
        'This is an automated receipt. Please keep this document for your records.',
        { align: 'center' }
      );
      doc.moveDown(0.5);
      doc.text('Need help? Contact us: Telegram @shadowintern | X @shadowintern', {
        align: 'center',
      });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

