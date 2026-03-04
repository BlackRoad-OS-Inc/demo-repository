'use strict';

const express = require('express');

function createBillingRouter({ checkout, webhooks, subscriptions }) {
  const router = express.Router();

  // Create checkout session
  router.post('/checkout', express.json(), async (req, res) => {
    try {
      const { tier, customerId } = req.body;
      if (!tier) {
        return res.status(400).json({ error: 'tier is required' });
      }
      const session = await checkout.createCheckoutSession({
        tier,
        customerId,
        successUrl: req.body.successUrl,
        cancelUrl: req.body.cancelUrl,
      });
      res.json({ sessionId: session.id, url: session.url });
    } catch (err) {
      console.error('[billing] Checkout error:', err.message);
      res.status(400).json({ error: err.message });
    }
  });

  // Get checkout session result
  router.get('/checkout/:sessionId', async (req, res) => {
    try {
      const session = await checkout.getSession(req.params.sessionId);
      res.json(session);
    } catch (err) {
      res.status(404).json({ error: 'Session not found' });
    }
  });

  // Stripe webhook — raw body required
  router.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    if (!sig) {
      return res.status(400).json({ error: 'Missing stripe-signature header' });
    }

    let event;
    try {
      event = webhooks.constructEvent(req.body, sig);
    } catch (err) {
      console.error('[billing] Webhook signature verification failed:', err.message);
      return res.status(400).json({ error: 'Invalid signature' });
    }

    try {
      const result = await webhooks.handleEvent(event);
      res.json({ received: true, result });
    } catch (err) {
      console.error('[billing] Webhook handler error:', err.message);
      res.status(500).json({ error: 'Webhook handler failed' });
    }
  });

  // Get subscription
  router.get('/subscriptions/:id', async (req, res) => {
    try {
      const sub = await subscriptions.getSubscription(req.params.id);
      res.json(sub);
    } catch (err) {
      res.status(404).json({ error: 'Subscription not found' });
    }
  });

  // Cancel subscription
  router.post('/subscriptions/:id/cancel', express.json(), async (req, res) => {
    try {
      const { immediate } = req.body || {};
      const sub = await subscriptions.cancelSubscription(req.params.id, { immediate });
      res.json(sub);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Change subscription tier
  router.post('/subscriptions/:id/change-tier', express.json(), async (req, res) => {
    try {
      const { tier } = req.body;
      if (!tier) {
        return res.status(400).json({ error: 'tier is required' });
      }
      const sub = await subscriptions.changeTier(req.params.id, tier);
      res.json(sub);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Create customer
  router.post('/customers', express.json(), async (req, res) => {
    try {
      const { email, name, metadata } = req.body;
      if (!email) {
        return res.status(400).json({ error: 'email is required' });
      }
      const customer = await subscriptions.createCustomer({ email, name, metadata });
      res.json(customer);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Customer portal
  router.post('/portal', express.json(), async (req, res) => {
    try {
      const { customerId, returnUrl } = req.body;
      if (!customerId) {
        return res.status(400).json({ error: 'customerId is required' });
      }
      const session = await subscriptions.getCustomerPortalSession(customerId, returnUrl);
      res.json({ url: session.url });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // List invoices
  router.get('/customers/:customerId/invoices', async (req, res) => {
    try {
      const invoices = await subscriptions.listInvoices(req.params.customerId, {
        limit: parseInt(req.query.limit, 10) || 10,
      });
      res.json(invoices);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Health check
  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'billing', timestamp: new Date().toISOString() });
  });

  return router;
}

module.exports = { createBillingRouter };
