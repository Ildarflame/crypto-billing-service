import app from './app';
import { config } from './config/env';

const PORT = config.port;

app.listen(PORT, () => {
  console.log(`🚀 Crypto Billing Service running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`💳 Billing API: http://localhost:${PORT}/api/billing`);
  console.log(`🔔 Webhooks: http://localhost:${PORT}/api/webhooks`);
  console.log(`🔐 Admin API: http://localhost:${PORT}/api/admin`);
});

