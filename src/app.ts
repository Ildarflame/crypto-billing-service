import express, { Express } from 'express';
import billingRoutes from './routes/billingRoutes';
import webhookRoutes from './routes/webhookRoutes';
import adminRoutes from './routes/adminRoutes';
import { errorHandler } from './middlewares/errorHandler';
import { authAdmin } from './middlewares/authAdmin';

const app: Express = express();

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Webhook routes need raw body for signature verification
// Must be registered before express.json() middleware
app.use('/api/webhooks', express.raw({ type: 'application/json' }), webhookRoutes);

// Middleware for other routes
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/billing', billingRoutes);
app.use('/api/admin', authAdmin, adminRoutes);

// Error handler (must be last)
app.use(errorHandler);

export default app;

