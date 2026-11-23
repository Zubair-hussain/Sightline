const API_METHODS = new Map([
  ['/api/config', 'GET'], ['/api/audit', 'POST'],
  ['/api/report-html', 'POST'], ['/api/testcases', 'POST'],
]);

export function json(value, status = 200, extra = {}) {
  return Response.json(value, { status, headers: { 'cache-control': 'no-store', ...extra } });
}

function number(value, fallback, min = 1, max = 1_000_000) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new Error('Invalid router setting');
  return parsed;
}

export function parseBackends(raw = '[]') {
  const rows = JSON.parse(raw);
  if (!Array.isArray(rows) || rows.length > 12) throw new Error('BACKENDS must contain at most 12 replicas');
  const names = new Set();
  return rows.map((row) => {
    const url = new URL(row.url);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('Backend URLs must be HTTPS origins');
    }
    if (typeof row.name !== 'string' || !/^[a-z0-9-]{1,40}$/.test(row.name) || names.has(row.name)) {
      throw new Error('Backend names must be unique, short slugs');
    }
    names.add(row.name);
    return {
      name: row.name, url: url.origin,
      weight: number(row.weight, 1, 1, 100),
      maxInFlight: number(row.maxInFlight, 3, 1, 1000),
      inFlight: 0, lastUsed: 0, healthy: false, checkedAt: 0, retryAt: 0,
    };
  });
}

async function boundedBody(request, limit) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > limit) throw new Error('Request too large');
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error('Request too large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return body;
}

/** Single coordinator: capacity, health and hourly limits span every edge location. */
export class AuditRouter {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.backends = parseBackends(env.BACKENDS);
    this.sequence = 0;
    this.probing = null;
    this.rate = number(env.RATE_PER_HOUR, 20, 1, 10_000);
    this.headerTimeout = number(env.HEADER_TIMEOUT_MS, 8000, 100, 60_000);
    this.healthTimeout = number(env.HEALTH_TIMEOUT_MS, 3000, 100, 15_000);
    this.healthTtl = number(env.HEALTH_TTL_MS, 30_000, 100, 300_000);
    this.cooldown = number(env.FAILURE_COOLDOWN_MS, 30_000, 100, 300_000);
  }

  async timedFetch(url, init, timeout) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const signal = init.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal;
    try { return await fetch(url, { ...init, signal, redirect: 'manual' }); }
    finally { clearTimeout(timer); }
  }

  async probe(force = false) {
    if (this.probing) return this.probing;
    this.probing = Promise.all(this.backends.map(async (backend) => {
      const now = Date.now();
      if (!force && (now < backend.retryAt || now - backend.checkedAt < this.healthTtl)) return;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.healthTimeout);
        try {
          const response = await fetch(`${backend.url}/healthz`, { signal: controller.signal, redirect: 'manual', headers: { 'cache-control': 'no-cache' } });
          const health = response.ok ? await response.json() : null;
          backend.healthy = health?.status === 'ok' && health?.service === 'sightline-api';
          backend.retryAt = backend.healthy ? 0 : Date.now() + this.cooldown;
        } finally { clearTimeout(timer); }
      } catch { backend.healthy = false; backend.retryAt = Date.now() + this.cooldown; }
      backend.checkedAt = Date.now();
    })).finally(() => { this.probing = null; });
    return this.probing;
  }

  /** Persistent token bucket: a burst of RATE_PER_HOUR, refilled over an hour. */
  async allow(ip) {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
    const key = `rate:${Array.from(new Uint8Array(hash), (x) => x.toString(16).padStart(2, '0')).join('')}`;
    const now = Date.now();
    const accepted = await this.state.storage.transaction(async (tx) => {
      const prior = await tx.get(key);
      const tokens = prior ? Math.min(this.rate, prior.tokens + (now - prior.at) * this.rate / 3_600_000) : this.rate;
      if (tokens < 1) return false;
      await tx.put(key, { tokens: tokens - 1, at: now });
      return true;
    });
    if (!(await this.state.storage.getAlarm())) await this.state.storage.setAlarm(now + 3_600_000);
    return accepted;
  }

  async alarm() {
    const entries = await this.state.storage.list({ prefix: 'rate:' });
    const expired = [];
    for (const [key, value] of entries) if (Date.now() - value.at > 3_600_000) expired.push(key);
    for (let i = 0; i < expired.length; i += 128) await this.state.storage.delete(expired.slice(i, i + 128));
    if (entries.size > expired.length) await this.state.storage.setAlarm(Date.now() + 3_600_000);
  }

  choose(excluded) {
    return this.backends.filter((b) => b.healthy && b.inFlight < b.maxInFlight && !excluded.has(b.name))
      .sort((a, b) => ((a.inFlight + 1) / a.weight - (b.inFlight + 1) / b.weight) || (a.lastUsed - b.lastUsed))[0];
  }

  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === '/__probe' || path === '/healthz') {
      await this.probe(path === '/__probe');
      const available = this.backends.filter((b) => b.healthy).length;
      return json({ status: available === this.backends.length && available ? 'ok' : available ? 'degraded' : 'unavailable', available, configured: this.backends.length }, available ? 200 : 503);
    }
    if (!API_METHODS.has(path)) return json({ error: 'Not found' }, 404);
    if (request.method !== API_METHODS.get(path)) return json({ error: 'Method not allowed' }, 405, { allow: API_METHODS.get(path) });
    if (!this.env.ORIGIN_SECRET || !this.backends.length) return json({ error: 'Audit backends are not configured' }, 503, { 'retry-after': '30' });
    if (request.headers.has('content-encoding')) return json({ error: 'Encoded request bodies are not supported' }, 415);
    let body;
    if (request.method === 'POST') {
      try { body = await boundedBody(request, path === '/api/audit' ? 10_000 : 4_000_000); }
      catch { return json({ error: 'Request too large' }, 413); }
    }
    await this.probe();
    if (!this.choose(new Set())) return json({ error: 'All audit servers are busy or unavailable. Please retry shortly.' }, 503, { 'retry-after': '10' });
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    if (path === '/api/audit' && !(await this.allow(ip))) {
      return json({ error: `Rate limit: ${this.rate} audits per hour.` }, 429, { 'retry-after': String(Math.ceil(3600 / this.rate)) });
    }

    const attempted = new Set();
    for (;;) {
      const backend = this.choose(attempted);
      if (!backend) return json({ error: 'All audit servers are busy or unavailable. Please retry shortly.' }, 503, { 'retry-after': '10' });
      attempted.add(backend.name);
      backend.inFlight++;
      backend.lastUsed = ++this.sequence;
      let released = false;
      const release = () => { if (!released) { released = true; backend.inFlight--; } };
      const headers = new Headers({
        'content-type': 'application/json',
        'x-sightline-origin-key': this.env.ORIGIN_SECRET,
        'x-sightline-client-ip': ip,
      });
      try {
        const upstream = await this.timedFetch(`${backend.url}${path}`, { method: request.method, headers, body, signal: request.signal }, this.headerTimeout);
        const safeRetry = upstream.status === 503 && upstream.headers.get('x-sightline-retryable') === '1';
        if (safeRetry || (request.method === 'GET' && [502, 503, 504].includes(upstream.status))) {
          await upstream.body?.cancel();
          release();
          if (!safeRetry) { backend.healthy = false; backend.retryAt = Date.now() + this.cooldown; }
          continue;
        }
        const outputHeaders = new Headers({ 'cache-control': 'no-store', 'x-accel-buffering': 'no' });
        for (const key of ['content-type', 'content-disposition', 'content-security-policy', 'retry-after']) {
          if (upstream.headers.has(key)) outputHeaders.set(key, upstream.headers.get(key));
        }
        if (!upstream.body) { release(); return new Response(null, { status: upstream.status, headers: outputHeaders }); }
        const reader = upstream.body.getReader();
        // A live stream holds its capacity reservation until completion or cancellation.
        const stream = new ReadableStream({
          async pull(controller) {
            try {
              const result = await reader.read();
              if (result.done) { release(); controller.close(); }
              else controller.enqueue(result.value);
            } catch (error) { release(); controller.error(error); }
          },
          async cancel(reason) { try { await reader.cancel(reason); } finally { release(); } },
        });
        return new Response(stream, { status: upstream.status, headers: outputHeaders });
      } catch {
        release();
        backend.healthy = false;
        backend.retryAt = Date.now() + this.cooldown;
        // An audit may already have started. Never replay it after ambiguous transport failure.
        if (request.method !== 'GET' || request.signal.aborted) return json({ error: 'The audit server connection failed. Please try again.' }, 503, { 'retry-after': '10' });
      }
    }
  }
}
