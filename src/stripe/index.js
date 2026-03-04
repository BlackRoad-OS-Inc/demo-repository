'use strict';

const { createStripeClient, PRICING } = require('./config');
const { createCheckoutModule } = require('./checkout');
const { createWebhookModule } = require('./webhooks');
const { createSubscriptionModule } = require('./subscriptions');

function initStripe(stripeClient) {
  const stripe = stripeClient || createStripeClient();
  const checkout = createCheckoutModule(stripe);
  const webhooks = createWebhookModule(stripe);
  const subscriptions = createSubscriptionModule(stripe);

  return {
    stripe,
    checkout,
    webhooks,
    subscriptions,
    PRICING,
  };
}

module.exports = { initStripe, PRICING };
