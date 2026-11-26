import { json } from './router.mjs';
export { AuditRouter } from './router.mjs';

const DOWNLOADS = {
  windows: 'Sightline-Setup-x64.exe', mac: 'Sightline-mac-universal.dmg',
  linux: 'Sightline-linux-x86_64.AppImage', 'linux-deb': 'Sightline-linux-amd64.deb', 'linux-rpm': 'Sightline-linux-x86_64.rpm',
};

function router(env) { return env.ROUTER.get(env.ROUTER.idFromName('sightline-audits-v1')); }

function secure(response, cacheControl) {
  const headers = new Headers(response.headers);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  headers.set('x-frame-options', 'DENY');
  headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  if (cacheControl) headers.set('cache-control', cacheControl);
  return new Response(response.body, { status: response.status, headers });
}

/**
 * One address per page for search engines: http:// and www. requests for the public domain get a
 * permanent redirect to https://CANONICAL_HOST with the same path and query. Other hosts (workers.dev,
 * local development) are served unchanged. 308 keeps the method and body for non-GET requests.
 */
function canonicalRedirect(request, url, env) {
  const host = env.CANONICAL_HOST;
  if (!host || (url.hostname !== host && url.hostname !== `www.${host}`)) return null;
  if (url.protocol === 'https:' && url.hostname === host) return null;
  const target = new URL(url);
  target.protocol = 'https:'; target.hostname = host; target.port = '';
  return secure(Response.redirect(target.toString(), ['GET', 'HEAD'].includes(request.method) ? 301 : 308), 'public, max-age=86400');
}

export default {
  async fetch(request, env, context) {
    const url = new URL(request.url);
    const redirect = canonicalRedirect(request, url, env);
    if (redirect) return redirect;
    if (url.pathname.startsWith('/api/') || url.pathname === '/healthz') {
      // Only this small, public configuration response is cacheable. Reports and audits never are.
      const cacheable = url.pathname === '/api/config' && request.method === 'GET';
      const key = new Request(`${url.origin}/api/config`);
      if (cacheable) {
        const cached = await caches.default.match(key);
        if (cached) return secure(cached);
      }
      const response = await router(env).fetch(request);
      if (cacheable && response.ok) {
        const cached = secure(response, 'public, max-age=60');
        context.waitUntil(caches.default.put(key, cached.clone()));
        return cached;
      }
      return secure(response);
    }
    if (url.pathname.startsWith('/download/')) {
      if (!['GET', 'HEAD'].includes(request.method)) return secure(json({ error: 'Method not allowed' }, 405, { allow: 'GET, HEAD' }));
      const file = DOWNLOADS[url.pathname.slice('/download/'.length)];
      if (!file) return secure(json({ error: 'Unknown download' }, 404));
      return secure(Response.redirect(`https://github.com/Zubair-hussain/Sightline/releases/latest/download/${file}`, 302), 'public, max-age=300');
    }
    if (!['GET', 'HEAD'].includes(request.method)) return secure(json({ error: 'Method not allowed' }, 405, { allow: 'GET, HEAD' }));
    // Serve the shared browser UI at /app without forwarding any frontend traffic to replicas.
    if (url.pathname === '/app') url.pathname = '/app/';
    const response = await env.ASSETS.fetch(new Request(url, request));
    const immutable = url.pathname.startsWith('/_next/static/');
    const html = (response.headers.get('content-type') || '').includes('text/html');
    return secure(response, response.ok ? immutable ? 'public, max-age=31536000, immutable' : html || url.pathname.startsWith('/app/') ? 'no-cache' : 'public, max-age=3600' : 'no-store');
  },
  async scheduled(_event, env, context) {
    // Real HTTP readiness probes also wake idle replicas, subject to each provider's free-tier limits.
    context.waitUntil(router(env).fetch(new Request('https://router.internal/__probe', { method: 'POST' })).then(async (response) => {
      if (!response.ok) console.warn('No healthy audit backends');
      await response.body?.cancel();
    }));
  },
};
