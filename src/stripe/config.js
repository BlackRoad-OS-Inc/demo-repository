'use strict';

const Stripe = require('stripe');

const REQUIRED_ENV = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'];

function validateEnv() {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

function createStripeClient() {
  validateEnv();
  return Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2024-12-18.acacia',
    appInfo: {
      name: 'blackroad-os',
      version: '1.0.0',
      url: 'https://blackroad.ai',
    },
  });
}

// Pricing tiers for BlackRoad OS
const PRICING = {
  starter: {
    name: 'Starter',
    agents: 100,
    priceId: process.env.STRIPE_PRICE_STARTER || null,
  },
  professional: {
    name: 'Professional',
    agents: 5000,
    priceId: process.env.STRIPE_PRICE_PROFESSIONAL || null,
  },
  enterprise: {
    name: 'Enterprise',
    agents: 30000,
    priceId: process.env.STRIPE_PRICE_ENTERPRISE || null,
  },
};

module.exports = { createStripeClient, validateEnv, PRICING };
