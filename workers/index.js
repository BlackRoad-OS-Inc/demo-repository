/**
 * BlackRoad OS — Cloudflare Worker
 *
 * Handles edge requests: static asset serving and async task dispatch.
 * Longer CPU-bound tasks are offloaded via the queue (ctx.waitUntil)
 * so the HTTP response is returned immediately while work continues.
 */

export default {
  /** @param {Request} request @param {Env} env @param {ExecutionContext} ctx */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Health-check / readiness probe
    if (url.pathname === '/health') {
      return Response.json({ status: 'ok', region: request.cf?.colo ?? 'unknown' });
    }

    // API: enqueue a longer background task and respond immediately
    if (url.pathname === '/api/task' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      ctx.waitUntil(runBackgroundTask(body, env));
      return Response.json({ queued: true, message: 'Task accepted and processing in background' }, { status: 202 });
    }

    // Serve the static landing page for all other GET requests
    if (request.method === 'GET') {
      return new Response(LANDING_HTML, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=300',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'SAMEORIGIN',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
        },
      });
    }

    return new Response('Method Not Allowed', { status: 405 });
  },
};

/**
 * Background task handler — runs after the HTTP response is sent.
 * Use this pattern for any work exceeding the synchronous CPU budget.
 *
 * @param {object} payload
 * @param {Env} env
 */
async function runBackgroundTask(payload, env) {
  // Simulate processing; replace with real logic (KV writes, D1 queries, etc.)
  const result = { processed: true, payload, ts: Date.now() };
  if (env.RESULTS_KV) {
    await env.RESULTS_KV.put(`task:${Date.now()}`, JSON.stringify(result), { expirationTtl: 86400 });
  }
}

// Inlined landing page (keeps the worker self-contained; no static asset fetch needed)
const LANDING_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BlackRoad OS, Inc.</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <style>
    :root {
      --hot-pink: #FF1D6C;
      --amber: #F5A623;
      --electric-blue: #2979FF;
      --violet: #9C27B0;
      --gradient-brand: linear-gradient(135deg, #F5A623 0%, #FF1D6C 38.2%, #9C27B0 61.8%, #2979FF 100%);
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif;
      background: #000;
      color: #fff;
      line-height: 1.618;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 34px;
    }
    .logo {
      font-size: 3rem;
      font-weight: 800;
      background: var(--gradient-brand);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 13px;
    }
    .tagline { font-size: 1.25rem; color: rgba(255,255,255,0.6); margin-bottom: 55px; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 21px;
      max-width: 900px;
      width: 100%;
    }
    .card {
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      padding: 34px;
      transition: border-color 0.2s;
    }
    .card:hover { border-color: rgba(255,255,255,0.3); }
    .card h3 { font-size: 1.1rem; margin-bottom: 8px; }
    .card p { font-size: 0.875rem; color: rgba(255,255,255,0.5); }
    .footer { margin-top: 89px; font-size: 0.75rem; color: rgba(255,255,255,0.3); }
  </style>
</head>
<body>
  <div class="logo">BlackRoad OS</div>
  <p class="tagline">The operating system for governed AI</p>
  <div class="grid">
    <div class="card">
      <h3>Tokenless Gateway</h3>
      <p>Agents never hold API keys. All provider communication routes through the governed gateway with full audit trails.</p>
    </div>
    <div class="card">
      <h3>30,000 Agents</h3>
      <p>Deploy and orchestrate thousands of autonomous AI agents with cryptographic identity and policy enforcement.</p>
    </div>
    <div class="card">
      <h3>Multi-Provider</h3>
      <p>Route to Anthropic, OpenAI, Ollama, Gemini, or custom models. Smart routing picks the best provider per task.</p>
    </div>
    <div class="card">
      <h3>Edge Compute</h3>
      <p>Run inference on Raspberry Pi clusters with Hailo-8 AI accelerators. 52 TOPS of local AI compute.</p>
    </div>
    <div class="card">
      <h3>RoadChain Ledger</h3>
      <p>Immutable, append-only audit trail with PS-SHA-infinity cryptographic identity chains and tamper detection.</p>
    </div>
    <div class="card">
      <h3>Policy Engine</h3>
      <p>Define behavioral policies in plain language. Enforce compliance before execution. HIPAA, SOC 2, FedRAMP ready.</p>
    </div>
  </div>
  <p class="footer">&copy; 2024-2026 BlackRoad OS, Inc. All rights reserved.</p>
</body>
</html>`;
