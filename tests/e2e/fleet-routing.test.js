'use strict';

const http = require('http');
const { createMockStripe } = require('../helpers/stripe-mock');

// Set env vars for pricing config
process.env.STRIPE_PRICE_STARTER = 'price_starter_test';
process.env.STRIPE_PRICE_PROFESSIONAL = 'price_professional_test';
process.env.STRIPE_PRICE_ENTERPRISE = 'price_enterprise_test';

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
    const payload = body ? JSON.stringify(body) : null;

    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: {},
    };

    if (payload) {
      opts.headers['content-type'] = 'application/json';
      opts.headers['content-length'] = Buffer.byteLength(payload);
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

function webhookRequest(path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const payload = JSON.stringify(body);

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload),
          'stripe-signature': 't=123,v1=fakesig',
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

describe('E2E: Pi Fleet Routing', () => {
  test('get fleet status', async () => {
    const res = await request('GET', '/api/fleet/status');
    expect(res.status).toBe(200);
    expect(res.body.devices).toHaveLength(4);

    const gateway = res.body.devices.find((d) => d.id === 'pi-gateway-01');
    expect(gateway).toBeTruthy();
    expect(gateway.role).toBe('gateway');
    expect(gateway.capabilities).toContain('billing-relay');
  });

  test('route provision action to compute nodes', async () => {
    const res = await request('POST', '/api/fleet/route', {
      action: 'provision',
      payload: { customerId: 'cus_test', tier: 'professional', agentLimit: 5000 },
    });
    expect(res.status).toBe(200);
    expect(res.body.routed).toBe(true);
    expect(res.body.action).toBe('provision');
    expect(res.body.targets).toHaveLength(1);
    expect(res.body.targets[0].role).toBe('compute');
  });

  test('route deprovision broadcasts to all compute nodes', async () => {
    const res = await request('POST', '/api/fleet/route', {
      action: 'deprovision',
      payload: { subscriptionId: 'sub_test', customerId: 'cus_test' },
    });
    expect(res.status).toBe(200);
    expect(res.body.routed).toBe(true);
    expect(res.body.targets).toHaveLength(2);
    expect(res.body.targets.every((t) => t.role === 'compute')).toBe(true);
  });

  test('route payment_succeeded to ledger and gateway', async () => {
    const res = await request('POST', '/api/fleet/route', {
      action: 'payment_succeeded',
      payload: { invoiceId: 'inv_test', amountPaid: 9900 },
    });
    expect(res.status).toBe(200);
    expect(res.body.targets).toHaveLength(2);
    const roles = res.body.targets.map((t) => t.role);
    expect(roles).toContain('ledger');
    expect(roles).toContain('gateway');
  });

  test('route payment_failed to gateway for throttling', async () => {
    const res = await request('POST', '/api/fleet/route', {
      action: 'payment_failed',
      payload: { invoiceId: 'inv_fail', attemptCount: 3 },
    });
    expect(res.status).toBe(200);
    expect(res.body.targets).toHaveLength(1);
    expect(res.body.targets[0].role).toBe('gateway');
  });

  test('route update action to gateway', async () => {
    const res = await request('POST', '/api/fleet/route', {
      action: 'update',
      payload: { subscriptionId: 'sub_123', status: 'active' },
    });
    expect(res.status).toBe(200);
    expect(res.body.targets).toHaveLength(1);
    expect(res.body.targets[0].deviceId).toBe('pi-gateway-01');
  });

  test('handle unknown action', async () => {
    const res = await request('POST', '/api/fleet/route', {
      action: 'unknown_action',
      payload: {},
    });
    expect(res.status).toBe(200);
    expect(res.body.routed).toBe(false);
  });

  test('reject missing action', async () => {
    const res = await request('POST', '/api/fleet/route', {
      payload: {},
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('action is required');
  });
});

describe('E2E: Full Billing -> Fleet Pipeline', () => {
  test('checkout webhook triggers fleet provisioning path', async () => {
    // Step 1: Simulate a completed checkout webhook
    const webhookRes = await webhookRequest('/api/billing/webhooks/stripe', {
      type: 'checkout.session.completed',
      data: {
        object: {
          customer: 'cus_pipeline_test',
          subscription: 'sub_pipeline_test',
          metadata: { tier: 'enterprise', agent_limit: '30000' },
        },
      },
    });

    expect(webhookRes.status).toBe(200);
    expect(webhookRes.body.result.action).toBe('provision');
    expect(webhookRes.body.result.tier).toBe('enterprise');

    // Step 2: Route the provision action to the fleet
    const routeRes = await request('POST', '/api/fleet/route', {
      action: webhookRes.body.result.action,
      payload: {
        customerId: webhookRes.body.result.customerId,
        subscriptionId: webhookRes.body.result.subscriptionId,
        tier: webhookRes.body.result.tier,
        agentLimit: webhookRes.body.result.agentLimit,
      },
    });

    expect(routeRes.body.routed).toBe(true);
    expect(routeRes.body.action).toBe('provision');
    expect(routeRes.body.targets[0].role).toBe('compute');
    expect(routeRes.body.targets[0].payload.agentLimit).toBe(30000);
  });
});
