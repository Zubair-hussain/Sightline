import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { AuditRouter, parseBackends } from '../src/router.mjs';
import worker from '../src/worker.mjs';

const originalFetch = globalThis.fetch;
let calls;
beforeEach(() => { calls = []; });
afterEach(() => { globalThis.fetch = originalFetch; });

function storage() {
  const rows = new Map();
  let alarm = null;
  return {
    get: async (key) => rows.get(key), put: async (key, value) => rows.set(key, value),
    transaction: async (fn) => fn({ get: async (key) => rows.get(key), put: async (key, value) => rows.set(key, value) }),
    getAlarm: async () => alarm, setAlarm: async (value) => { alarm = value; },
    list: async () => rows, delete: async (keys) => keys.forEach((key) => rows.delete(key)),
  };
}

function create(overrides = {}, store = storage()) {
  return new AuditRouter({ storage: store }, {
    BACKENDS: JSON.stringify([
      { name: 'vercel-a', url: 'https://a.example', maxInFlight: 1 },
      { name: 'render', url: 'https://b.example', maxInFlight: 1 },
    ]),
    ORIGIN_SECRET: 'test-secret', ...overrides,
  });
}

function mock(handler) {
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/healthz')) return Response.json({ status: 'ok', service: 'sightline-api' });
    return handler(String(url), init);
  };
}

function request(path = '/api/audit', overrides = {}) {
  return new Request(`https://sightline.example${path}`, {
    method: path === '/api/config' ? 'GET' : 'POST',
    headers: { 'cf-connecting-ip': '203.0.113.12', 'content-type': 'application/json', 'x-sightline-origin-key': 'spoofed', cookie: 'private=1' },
    ...(path === '/api/config' ? {} : { body: JSON.stringify({ url: 'https://example.com' }) }), ...overrides,
  });
}

test('backend configuration rejects URL paths, credentials, duplicates and insecure origins', () => {
  for (const url of ['http://example.com', 'https://user:secret@example.com', 'https://example.com/api', 'https://example.com/?x=1']) {
    assert.throws(() => parseBackends(JSON.stringify([{ name: 'a', url }])));
  }
  assert.throws(() => parseBackends('[{"name":"a","url":"https://a.example"},{"name":"a","url":"https://b.example"}]'));
});

test('balances active streams, enforces capacity, and releases cancelled streams', async () => {
  mock(() => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{"type":"progress"}\n')); } }), { headers: { 'content-type': 'application/x-ndjson' } }));
  const router = create();
  const first = await router.fetch(request());
  const second = await router.fetch(request());
  assert.deepEqual(calls.filter((c) => c.url.endsWith('/api/audit')).map((c) => c.url), ['https://a.example/api/audit', 'https://b.example/api/audit']);
  assert.equal((await router.fetch(request())).status, 503);
  assert.equal(first.headers.get('cache-control'), 'no-store');
  await first.body.cancel();
  const third = await router.fetch(request());
  assert.equal(third.status, 200);
  await second.body.cancel();
  await third.body.cancel();
  assert.ok(router.backends.every((b) => b.inFlight === 0));
});

test('fails over explicit pre-execution overload and replaces spoofed authentication headers', async () => {
  mock((url, init) => {
    assert.equal(init.headers.get('x-sightline-origin-key'), 'test-secret');
    assert.equal(init.headers.get('x-sightline-client-ip'), '203.0.113.12');
    assert.equal(init.headers.get('cookie'), null);
    return url.startsWith('https://a.')
      ? new Response('busy', { status: 503, headers: { 'x-sightline-retryable': '1' } })
      : new Response('{"type":"report"}\n', { headers: { 'content-type': 'application/x-ndjson', 'set-cookie': 'secret=1' } });
  });
  const router = create();
  const response = await router.fetch(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('set-cookie'), null);
  assert.match(await response.text(), /report/);
  assert.ok(router.backends.every((b) => b.inFlight === 0));
});

test('does not replay audit POST after an ambiguous network failure', async () => {
  mock(() => { throw new Error('connection reset'); });
  const router = create();
  assert.equal((await router.fetch(request())).status, 503);
  assert.equal(calls.filter((c) => c.url.endsWith('/api/audit')).length, 1);
});

test('safe GET fails over when a provider is unavailable', async () => {
  mock((url) => url.startsWith('https://a.') ? new Response('gateway error', { status: 502 }) : Response.json({ version: '1.0.0' }));
  const response = await create().fetch(request('/api/config'));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).version, '1.0.0');
});

test('persisted global audit limit survives coordinator restart', async () => {
  mock(() => new Response('done'));
  const store = storage();
  const first = await create({ RATE_PER_HOUR: '1' }, store).fetch(request());
  await first.text();
  const second = await create({ RATE_PER_HOUR: '1' }, store).fetch(request());
  assert.equal(second.status, 429);
  assert.equal(second.headers.get('retry-after'), '3600');
});

test('health checks distinguish dead origins from actual Sightline replicas', async () => {
  globalThis.fetch = async (url) => String(url).startsWith('https://a.')
    ? Response.json({ status: 'ok', service: 'sightline-api' })
    : new Response('<html>starting up</html>');
  const response = await create().fetch(new Request('https://router.internal/healthz'));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'degraded', available: 1, configured: 2 });
});

test('health failures cool down instead of probing on every request', async () => {
  let probes = 0;
  globalThis.fetch = async () => { probes++; throw new Error('offline'); };
  const router = create();
  assert.equal((await router.fetch(request())).status, 503);
  assert.equal((await router.fetch(request())).status, 503);
  assert.equal(probes, 2);
});

test('rejects oversized streaming bodies, unknown routes and unsupported methods', async () => {
  const router = create();
  assert.equal((await router.fetch(request('/api/audit', { body: 'x'.repeat(10_001) }))).status, 413);
  assert.equal((await router.fetch(new Request('https://edge.example/api/private'))).status, 404);
  assert.equal((await router.fetch(new Request('https://edge.example/api/audit'))).status, 405);
});

test('fails closed without a secret or backend configuration', async () => {
  assert.equal((await create({ ORIGIN_SECRET: '' }).fetch(request())).status, 503);
  assert.equal((await create({ BACKENDS: '[]' }).fetch(request())).status, 503);
});

test('a broken accepted stream releases capacity without rerunning the audit', async () => {
  mock(() => new Response(new ReadableStream({ pull(c) { c.error(new Error('truncated')); } })));
  const router = create();
  const response = await router.fetch(request());
  await assert.rejects(response.text(), /truncated/);
  assert.equal(calls.filter((c) => c.url.endsWith('/api/audit')).length, 1);
  assert.ok(router.backends.every((b) => b.inFlight === 0));
});

test('Cloudflare serves frontend files without contacting an API origin', async () => {
  let assetUrl;
  const env = { ASSETS: { fetch: async (r) => { assetUrl = r.url; return new Response('<html>app</html>', { headers: { 'content-type': 'text/html' } }); } } };
  const response = await worker.fetch(new Request('https://edge.example/app?url=example.com'), env, {});
  assert.equal(new URL(assetUrl).pathname, '/app/');
  assert.equal(new URL(assetUrl).search, '?url=example.com');
  assert.equal(response.headers.get('cache-control'), 'no-cache');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
});

test('http:// and www. on the public domain redirect permanently to https://CANONICAL_HOST', async () => {
  const env = { CANONICAL_HOST: 'sightaud.com' };
  for (const from of ['http://sightaud.com/blogs?x=1', 'http://www.sightaud.com/blogs?x=1', 'https://www.sightaud.com/blogs?x=1']) {
    const response = await worker.fetch(new Request(from), env, {});
    assert.equal(response.status, 301, from);
    assert.equal(response.headers.get('location'), 'https://sightaud.com/blogs?x=1', from);
    assert.equal(response.headers.get('strict-transport-security'), 'max-age=31536000; includeSubDomains');
  }
  const post = await worker.fetch(new Request('http://sightaud.com/api/audit', { method: 'POST', body: '{}' }), env, {});
  assert.equal(post.status, 308);
  assert.equal(post.headers.get('location'), 'https://sightaud.com/api/audit');
});

test('the canonical host, workers.dev and local development are not redirected', async () => {
  const env = { CANONICAL_HOST: 'sightaud.com', ASSETS: { fetch: async () => new Response('ok', { headers: { 'content-type': 'text/html' } }) } };
  for (const url of ['https://sightaud.com/', 'https://sightline.example.workers.dev/', 'http://localhost:8787/']) {
    assert.equal((await worker.fetch(new Request(url), env, {})).status, 200, url);
  }
  assert.equal((await worker.fetch(new Request('http://sightaud.com/'), { ASSETS: env.ASSETS }, {})).status, 200, 'no CANONICAL_HOST, no redirect');
});

test('Cloudflare downloads only redirect to known release filenames', async () => {
  const response = await worker.fetch(new Request('https://edge.example/download/windows'), {}, {});
  assert.equal(response.status, 302);
  assert.match(response.headers.get('location'), /Sightline-Setup-x64.exe$/);
  assert.equal((await worker.fetch(new Request('https://edge.example/download/unknown'), {}, {})).status, 404);
});
