'use strict';

/**
 * Stripe mock for testing — simulates Stripe API responses
 * without hitting real endpoints.
 */

const crypto = require('crypto');

function generateId(prefix) {
  return `${prefix}_test_${crypto.randomBytes(8).toString('hex')}`;
}

function createMockStripe() {
  const customers = new Map();
  const subscriptions = new Map();
  const sessions = new Map();
  const invoices = new Map();

  const mockStripe = {
    checkout: {
      sessions: {
        create: async (params) => {
          const session = {
            id: generateId('cs'),
            object: 'checkout.session',
            mode: params.mode,
            url: `https://checkout.stripe.com/test/${generateId('cs')}`,
            customer: params.customer || null,
            subscription: generateId('sub'),
            metadata: params.metadata || {},
            success_url: params.success_url,
            cancel_url: params.cancel_url,
            status: 'complete',
            payment_status: 'paid',
          };
          sessions.set(session.id, session);
          return session;
        },
        retrieve: async (id, _opts) => {
          const session = sessions.get(id);
          if (!session) throw new Error(`No such checkout session: ${id}`);
          return session;
        },
      },
    },

    customers: {
      create: async (params) => {
        const customer = {
          id: generateId('cus'),
          object: 'customer',
          email: params.email,
          name: params.name || null,
          metadata: params.metadata || {},
          created: Math.floor(Date.now() / 1000),
        };
        customers.set(customer.id, customer);
        return customer;
      },
    },

    subscriptions: {
      retrieve: async (id, _opts) => {
        const sub = subscriptions.get(id);
        if (!sub) {
          // Auto-create for testing
          const newSub = {
            id,
            object: 'subscription',
            status: 'active',
            customer: generateId('cus'),
            items: { data: [{ id: generateId('si'), price: { id: generateId('price') } }] },
            metadata: {},
            default_payment_method: null,
            latest_invoice: null,
          };
          subscriptions.set(id, newSub);
          return newSub;
        }
        return sub;
      },
      update: async (id, params) => {
        let sub = subscriptions.get(id);
        if (!sub) {
          sub = {
            id,
            object: 'subscription',
            status: 'active',
            customer: generateId('cus'),
            items: { data: [{ id: generateId('si'), price: { id: generateId('price') } }] },
            metadata: {},
          };
        }
        Object.assign(sub, {
          cancel_at_period_end: params.cancel_at_period_end || false,
          metadata: { ...sub.metadata, ...params.metadata },
        });
        if (params.items) {
          sub.items.data[0].price = { id: params.items[0].price };
        }
        subscriptions.set(id, sub);
        return sub;
      },
      cancel: async (id) => {
        const sub = subscriptions.get(id) || {
          id,
          object: 'subscription',
          customer: generateId('cus'),
          items: { data: [] },
          metadata: {},
        };
        sub.status = 'canceled';
        subscriptions.set(id, sub);
        return sub;
      },
    },

    invoices: {
      list: async (params) => {
        const list = [];
        for (const [, inv] of invoices) {
          if (inv.customer === params.customer) list.push(inv);
        }
        return { data: list.slice(0, params.limit || 10), has_more: false };
      },
    },

    billingPortal: {
      sessions: {
        create: async (params) => ({
          id: generateId('bps'),
          object: 'billing_portal.session',
          url: `https://billing.stripe.com/test/${generateId('bps')}`,
          customer: params.customer,
          return_url: params.return_url,
        }),
      },
    },

    webhooks: {
      constructEvent: (body, signature, secret) => {
        // In test mode, parse directly
        if (typeof body === 'string') return JSON.parse(body);
        if (Buffer.isBuffer(body)) return JSON.parse(body.toString());
        return body;
      },
    },

    // Test utilities
    _store: { customers, subscriptions, sessions, invoices },
  };

  return mockStripe;
}

module.exports = { createMockStripe, generateId };
