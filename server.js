'use strict';

const express = require('express');
const path = require('path');
const { initStripe } = require('./src/stripe');
const { createBillingRouter } = require('./src/routes/billing');
const { routeToFleet, getFleetStatus } = require('./src/routing/edge');

function createApp(options = {}) {
  const app = express();

  // Serve static landing page
  app.use(express.static(path.join(__dirname, '.')));

  // Initialize Stripe modules (allow injection for testing)
  let billing;
  if (options.billing) {
    billing = options.billing;
  } else {
    try {
      billing = initStripe();
    } catch (err) {
      console.warn(`[server] Stripe not configured: ${err.message}`);
      console.warn('[server] Billing routes will be unavailable. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.');
      billing = null;
    }
  }

  // Mount billing routes if Stripe is configured
  if (billing) {
    const billingRouter = createBillingRouter(billing);
    app.use('/api/billing', billingRouter);
  } else {
    app.use('/api/billing', (_req, res) => {
      res.status(503).json({ error: 'Billing not configured. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.' });
    });
  }

  // Fleet routing endpoint
  app.post('/api/fleet/route', express.json(), async (req, res) => {
    try {
      const { action, payload } = req.body;
      if (!action) {
        return res.status(400).json({ error: 'action is required' });
      }
      const result = await routeToFleet(action, payload);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Fleet status
  app.get('/api/fleet/status', (_req, res) => {
    res.json({ devices: getFleetStatus() });
  });

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      billing: billing ? 'configured' : 'unconfigured',
      timestamp: new Date().toISOString(),
    });
  });

  return app;
}

// Start server if run directly
if (require.main === module) {
  const app = createApp();
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`[blackroad] Server running on port ${PORT}`);
    console.log(`[blackroad] Billing: ${process.env.STRIPE_SECRET_KEY ? 'ENABLED' : 'DISABLED (set STRIPE_SECRET_KEY)'}`);
  });
}

module.exports = { createApp };
