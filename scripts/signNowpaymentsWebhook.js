const crypto = require('crypto');
const fs = require('fs');
require('dotenv').config();

const ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET || '';
const jsonFile = process.argv[2];

if (!ipnSecret) {
  console.error('Error: NOWPAYMENTS_IPN_SECRET environment variable is not set');
  console.error('Make sure you have a .env file with NOWPAYMENTS_IPN_SECRET set');
  process.exit(1);
}

if (!jsonFile) {
  console.error('Usage: node signNowpaymentsWebhook.js <webhook-payload.json>');
  process.exit(1);
}

if (!fs.existsSync(jsonFile)) {
  console.error(`Error: File not found: ${jsonFile}`);
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));

// Sort keys alphabetically and stringify
const sortedKeys = Object.keys(payload).sort();
const sortedBody = {};
for (const key of sortedKeys) {
  sortedBody[key] = payload[key];
}
const sortedBodyString = JSON.stringify(sortedBody);

// Compute HMAC-SHA512
const hmac = crypto.createHmac('sha512', ipnSecret);
hmac.update(sortedBodyString);
const signature = hmac.digest('hex');

console.log('Webhook Payload:');
console.log(JSON.stringify(sortedBody, null, 2));
console.log('\nSignature (x-nowpayments-sig header):');
console.log(signature);
console.log('\nExample curl command:');
console.log(`curl -X POST http://localhost:4000/api/webhooks/nowpayments \\`);
console.log(`  -H "Content-Type: application/json" \\`);
console.log(`  -H "x-nowpayments-sig: ${signature}" \\`);
console.log(`  --data-binary @${jsonFile}`);

