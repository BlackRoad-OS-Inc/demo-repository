'use strict';

const { PRICING } = require('./config');

function createSubscriptionModule(stripe) {
  async function getSubscription(subscriptionId) {
    return stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['default_payment_method', 'latest_invoice'],
    });
  }

  async function cancelSubscription(subscriptionId, { immediate = false } = {}) {
    if (immediate) {
      return stripe.subscriptions.cancel(subscriptionId);
    }
    return stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });
  }

  async function changeTier(subscriptionId, newTier) {
    const plan = PRICING[newTier];
    if (!plan) {
      throw new Error(`Invalid tier: ${newTier}`);
    }
    if (!plan.priceId) {
      throw new Error(`Price ID not configured for tier: ${newTier}`);
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    return stripe.subscriptions.update(subscriptionId, {
      items: [
        {
          id: subscription.items.data[0].id,
          price: plan.priceId,
        },
      ],
      metadata: {
        tier: newTier,
        agent_limit: String(plan.agents),
      },
      proration_behavior: 'always_invoice',
    });
  }

  async function createCustomer({ email, name, metadata = {} }) {
    return stripe.customers.create({
      email,
      name,
      metadata: {
        platform: 'blackroad-os',
        ...metadata,
      },
    });
  }

  async function getCustomerPortalSession(customerId, returnUrl) {
    return stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl || `${process.env.APP_URL || 'https://blackroad.ai'}/billing`,
    });
  }

  async function listInvoices(customerId, { limit = 10 } = {}) {
    return stripe.invoices.list({ customer: customerId, limit });
  }

  return {
    getSubscription,
    cancelSubscription,
    changeTier,
    createCustomer,
    getCustomerPortalSession,
    listInvoices,
  };
}

module.exports = { createSubscriptionModule };
