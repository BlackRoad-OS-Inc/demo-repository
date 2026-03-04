'use strict';

const { PRICING } = require('./config');

function createCheckoutModule(stripe) {
  async function createCheckoutSession({ tier, customerId, successUrl, cancelUrl }) {
    const plan = PRICING[tier];
    if (!plan) {
      throw new Error(`Invalid tier: ${tier}. Valid tiers: ${Object.keys(PRICING).join(', ')}`);
    }
    if (!plan.priceId) {
      throw new Error(`Price ID not configured for tier: ${tier}`);
    }

    const params = {
      mode: 'subscription',
      line_items: [{ price: plan.priceId, quantity: 1 }],
      success_url: successUrl || `${process.env.APP_URL || 'https://blackroad.ai'}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${process.env.APP_URL || 'https://blackroad.ai'}/billing/cancel`,
      metadata: {
        tier,
        agent_limit: String(plan.agents),
        platform: 'blackroad-os',
      },
    };

    if (customerId) {
      params.customer = customerId;
    }

    return stripe.checkout.sessions.create(params);
  }

  async function getSession(sessionId) {
    return stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription', 'customer'],
    });
  }

  return { createCheckoutSession, getSession };
}

module.exports = { createCheckoutModule };
