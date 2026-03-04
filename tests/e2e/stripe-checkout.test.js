'use strict';

const http = require('http');
const { createMockStripe } = require('../helpers/stripe-mock');

// Set env vars for pricing config
process.env.STRIPE_PRICE_STARTER = 'price_starter_test';
process.env.STRIPE_PRICE_PROFESSIONAL = 'price_professional_test';
process.env.STRIPE_PRICE_ENTERPRISE = 'price_enterprise_test';
process.env.APP_URL = 'http://localhost:0';

let server;
let baseUrl;

beforeAll((done) => {
  const mockStripe = createMockStripe();
  const { initStripe } = require('../../src/stripe');
  const billing = initStripe(mockStripe);

  const { createApp } = require('../../server');
  const app = createApp({ billing });

  server = http.createServer(app);
  server.listen(0, () => {
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
    done();
  });
});

afterAll((done) => {
  if (server) server.close(done);
  else done();
});

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const isWebhook = path.includes('/webhooks/');
    const payload = body ? JSON.stringify(body) : null;

    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {},
    };

    if (payload) {
      opts.headers['content-type'] = 'application/json';
      opts.headers['content-length'] = Buffer.byteLength(payload);
    }

    if (isWebhook) {
      opts.headers['stripe-signature'] = 't=123,v1=fakesig';
    }

    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

describe('E2E: Stripe Checkout Flow', () => {
  test('health endpoint returns ok', async () => {
    const res = await request('GET', '/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('billing health returns ok', async () => {
    const res = await request('GET', '/api/billing/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('billing');
  });

  test('create checkout session for starter tier', async () => {
    const res = await request('POST', '/api/billing/checkout', {
      tier: 'starter',
    });
    expect(res.status).toBe(200);
    expect(res.body.sessionId).toBeTruthy();
    expect(res.body.url).toContain('https://checkout.stripe.com');
  });

  test('create checkout session for professional tier', async () => {
    const res = await request('POST', '/api/billing/checkout', {
      tier: 'professional',
    });
    expect(res.status).toBe(200);
    expect(res.body.sessionId).toBeTruthy();
  });

  test('create checkout session for enterprise tier', async () => {
    const res = await request('POST', '/api/billing/checkout', {
      tier: 'enterprise',
    });
    expect(res.status).toBe(200);
    expect(res.body.sessionId).toBeTruthy();
  });

  test('reject invalid tier', async () => {
    const res = await request('POST', '/api/billing/checkout', {
      tier: 'nonexistent',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid tier');
  });

  test('reject missing tier', async () => {
    const res = await request('POST', '/api/billing/checkout', {});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('tier is required');
  });

  test('retrieve checkout session', async () => {
    const createRes = await request('POST', '/api/billing/checkout', {
      tier: 'starter',
    });
    const sessionId = createRes.body.sessionId;

    const res = await request('GET', `/api/billing/checkout/${sessionId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(sessionId);
  });
});

describe('E2E: Stripe Webhook Handling', () => {
  test('handle checkout.session.completed webhook', async () => {
    const res = await request('POST', '/api/billing/webhooks/stripe', {
      type: 'checkout.session.completed',
      data: {
        object: {
          customer: 'cus_test_123',
          subscription: 'sub_test_123',
          metadata: { tier: 'professional', agent_limit: '5000' },
        },
      },
    });
    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
    expect(res.body.result.action).toBe('provision');
    expect(res.body.result.tier).toBe('professional');
    expect(res.body.result.agentLimit).toBe(5000);
  });

  test('handle subscription.deleted webhook', async () => {
    const res = await request('POST', '/api/billing/webhooks/stripe', {
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_test_cancel',
          customer: 'cus_test_456',
        },
      },
    });
    expect(res.status).toBe(200);
    expect(res.body.result.action).toBe('deprovision');
  });

  test('handle invoice.paid webhook', async () => {
    const res = await request('POST', '/api/billing/webhooks/stripe', {
      type: 'invoice.paid',
      data: {
        object: {
          id: 'inv_test_paid',
          customer: 'cus_test_789',
          amount_paid: 9900,
        },
      },
    });
    expect(res.status).toBe(200);
    expect(res.body.result.action).toBe('payment_succeeded');
    expect(res.body.result.amountPaid).toBe(9900);
  });

  test('handle invoice.payment_failed webhook', async () => {
    const res = await request('POST', '/api/billing/webhooks/stripe', {
      type: 'invoice.payment_failed',
      data: {
        object: {
          id: 'inv_test_failed',
          customer: 'cus_test_fail',
          attempt_count: 2,
        },
      },
    });
    expect(res.status).toBe(200);
    expect(res.body.result.action).toBe('payment_failed');
    expect(res.body.result.attemptCount).toBe(2);
  });

  test('handle unknown event type gracefully', async () => {
    const res = await request('POST', '/api/billing/webhooks/stripe', {
      type: 'some.unknown.event',
      data: { object: {} },
    });
    expect(res.status).toBe(200);
    expect(res.body.result.action).toBe('ignored');
  });

  test('reject webhook without signature', async () => {
    const url = new URL('/api/billing/webhooks/stripe', baseUrl);
    const payload = JSON.stringify({ type: 'test' });

    const res = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(payload),
          },
        },
        (res) => {
          let data = '';
          res.on('data', (c) => { data += c; });
          res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
        }
      );
      req.on('error', reject);
      req.write(payload);
      req.end();
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing stripe-signature header');
  });
});

describe('E2E: Customer & Subscription Management', () => {
  test('create customer', async () => {
    const res = await request('POST', '/api/billing/customers', {
      email: 'test@blackroad.ai',
      name: 'Test Org',
    });
    expect(res.status).toBe(200);
    expect(res.body.id).toMatch(/^cus_/);
    expect(res.body.email).toBe('test@blackroad.ai');
  });

  test('reject customer without email', async () => {
    const res = await request('POST', '/api/billing/customers', {
      name: 'No Email',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('email is required');
  });

  test('get customer portal session', async () => {
    const customer = await request('POST', '/api/billing/customers', {
      email: 'portal@blackroad.ai',
    });
    const res = await request('POST', '/api/billing/portal', {
      customerId: customer.body.id,
    });
    expect(res.status).toBe(200);
    expect(res.body.url).toContain('https://billing.stripe.com');
  });

  test('reject portal without customerId', async () => {
    const res = await request('POST', '/api/billing/portal', {});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('customerId is required');
  });
});
