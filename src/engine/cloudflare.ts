import { promises as dns } from 'node:dns';
import * as tls from 'node:tls';
import { check, category, fetchUrl } from './util';
import type { Page } from './page';

const CF_V4 = [
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18', '108.162.192.0/18',
  '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
  '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
];
const CF_V6 = ['2400:cb00', '2606:4700', '2803:f800', '2405:b500', '2405:8100', '2a06:98c0', '2a06:98c1', '2c0f:f248'];

function ipToInt(ip: string): number {
  return ip.split('.').reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
}
export function isCloudflareIp(ip: string): boolean {
  if (ip.includes(':')) return CF_V6.some((p) => ip.toLowerCase().startsWith(p));
  const n = ipToInt(ip);
  return CF_V4.some((cidr) => {
    const [base, bits] = cidr.split('/');
    const mask = bits === '0' ? 0 : (~0 << (32 - Number(bits))) >>> 0;
    return (n & mask) === (ipToInt(base) & mask);
  });
}

export function registrableDomain(host: string): string {
  const parts = host.replace(/\.$/, '').split('.');
  if (parts.length <= 2) return parts.join('.');
  const sld = parts[parts.length - 2];
  const tld = parts[parts.length - 1];
  const twoLevel = tld.length === 2 && (sld.length <= 3 || ['com', 'net', 'org', 'gov', 'edu', 'ac', 'co'].includes(sld));
  return parts.slice(twoLevel ? -3 : -2).join('.');
}

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try { return await p; } catch { return fallback; }
}

async function doh(name: string, type: string): Promise<{ AD?: boolean; Answer?: { data: string }[] } | null> {
  const r = await fetchUrl(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, { headers: { accept: 'application/dns-json' }, timeout: 8000 });
  try { return JSON.parse(r.body); } catch { return null; }
}

/** Returns true/false, or null when this TLS library cannot offer TLS 1.0/1.1 at all (so the probe is inconclusive). */
function acceptsLegacyTls(host: string): Promise<boolean | null> {
  // OpenSSL (plain Node) needs SECLEVEL=0 to offer TLS 1.0/1.1; BoringSSL (Electron) rejects that string.
  const isBoring = Boolean(process.versions.electron) || !process.versions.openssl;
  const attempt = (opts: tls.ConnectionOptions) => new Promise<boolean | null>((resolve) => {
    let s: tls.TLSSocket;
    try {
      s = tls.connect({ host, port: 443, servername: host, minVersion: 'TLSv1', maxVersion: 'TLSv1.1', rejectUnauthorized: false, timeout: 8000, ...opts }, () => { resolve(true); s.end(); });
    } catch { resolve(null); return; }
    s.on('error', (e: Error & { code?: string }) => resolve(/NO_PROTOCOLS|UNSUPPORTED_PROTOCOL|INVALID_COMMAND|no protocols available/i.test(`${e.code} ${e.message}`) && !/alert/i.test(e.message) ? null : false));
    s.on('timeout', () => { s.destroy(); resolve(false); });
  });
  return isBoring ? attempt({}) : attempt({ ciphers: 'DEFAULT@SECLEVEL=0' });
}

export interface CloudflareData {
  onCloudflare: boolean;
  fullSetup: boolean;
  colo: string;
  nameservers: string[];
  ips: string[];
  trace: Record<string, string>;
  zone?: Record<string, unknown>;
}

interface CfSetting { id: string; value: unknown }

async function cfApi(token: string, path: string): Promise<{ success: boolean; result: unknown; errors?: { message: string }[] }> {
  const r = await fetchUrl(`https://api.cloudflare.com/client/v4${path}`, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' }, timeout: 15000 });
  try { return JSON.parse(r.body); } catch { return { success: false, result: null, errors: [{ message: `HTTP ${r.status}` }] }; }
}

export async function auditCloudflare(page: Page, token: string | undefined, log: (s: string) => void): Promise<SL.Category<CloudflareData>> {
  const checks: SL.Check[] = [];
  const host = new URL(page.finalUrl).hostname;
  const apex = registrableDomain(host);
  const h = page.headers;

  log('Resolving DNS');
  const [a4, a6, ns, caa, mx] = await Promise.all([
    safe(dns.resolve4(host), [] as string[]),
    safe(dns.resolve6(host), [] as string[]),
    safe(dns.resolveNs(apex), [] as string[]),
    safe(dns.resolveCaa(apex), [] as { critical: number; issue?: string; issuewild?: string; iodef?: string }[]),
    safe(dns.resolveMx(apex), [] as { exchange: string; priority: number }[]),
  ]);
  const ips = [...a4, ...a6];
  const cfIps = ips.filter(isCloudflareIp);
  const cfNs = ns.filter((n) => /\.ns\.cloudflare\.com$/i.test(n));
  const headerCf = Boolean(h['cf-ray']) || /cloudflare/i.test(h.server || '');
  const onCloudflare = headerCf || cfIps.length > 0;
  const fullSetup = cfNs.length > 0;

  let trace: Record<string, string> = {};
  if (onCloudflare) {
    log('Querying Cloudflare edge trace');
    const t = await fetchUrl(`https://${host}/cdn-cgi/trace`, { timeout: 8000 });
    if (t.status === 200) trace = Object.fromEntries(t.body.split('\n').filter((l) => l.includes('=')).map((l) => [l.split('=')[0], l.slice(l.indexOf('=') + 1)]));
  }
  const colo = trace.colo || (h['cf-ray'] || '').split('-')[1] || '';

  checks.push(onCloudflare
    ? check('cf.proxied', 'Traffic proxied by Cloudflare', 'pass', `cf-ray ${h['cf-ray'] || '—'}${colo ? ` · edge ${colo}` : ''}${cfIps.length ? ` · ${cfIps.length} Cloudflare IP(s)` : ''}`, { weight: 3 })
    : check('cf.proxied', 'Traffic proxied by Cloudflare', 'info', `No Cloudflare edge detected (server: ${h.server || 'unknown'}). Cloudflare-specific checks are skipped; DNS checks still apply.`, { fix: 'Putting the site behind Cloudflare (orange-cloud) adds CDN caching, DDoS protection, HTTP/3 and a WAF.' }));
  checks.push(fullSetup
    ? check('cf.ns', 'Cloudflare nameservers', 'pass', cfNs.join(', '))
    : check('cf.ns', 'Cloudflare nameservers', onCloudflare ? 'info' : 'info', ns.length ? `Nameservers: ${ns.join(', ')}${onCloudflare ? ' (partial/CNAME setup)' : ''}` : 'Could not resolve nameservers.'));

  if (onCloudflare) {
    // Bot challenge on the main page hurts SEO crawlers
    const challenged = h['cf-mitigated'] === 'challenge' || (page.res.status === 403 && /challenge-platform|cf-chl/i.test(page.html));
    checks.push(challenged
      ? check('cf.challenge', 'No challenge for crawlers', 'fail', 'Cloudflare served a challenge page to an automated client. Search/SEO bots may be blocked too.', { weight: 3, fix: 'Review Bot Fight Mode / Security Level and allow verified bots (WAF → Skip rule for cf.client.bot).' })
      : check('cf.challenge', 'No challenge for crawlers', 'pass', 'Page was served without a Cloudflare challenge.', { weight: 3 }));

    const cs = (h['cf-cache-status'] || '').toUpperCase();
    checks.push(['HIT', 'REVALIDATED', 'UPDATING', 'STALE'].includes(cs)
      ? check('cf.html-cache', 'HTML edge caching', 'pass', `cf-cache-status: ${cs}`)
      : check('cf.html-cache', 'HTML edge caching', 'info', `cf-cache-status: ${cs || 'none'} — HTML is fetched from origin on every request.`, { fix: 'For mostly-static pages, a Cache Rule ("Eligible for cache") or APO can cut TTFB dramatically.' }));

    // Static asset caching
    const asset = page.$('link[rel="stylesheet"][href], script[src]').map((_, el) => page.$(el).attr('href') || page.$(el).attr('src') || '').get()
      .map((s) => { try { return new URL(s, page.finalUrl).href; } catch { return ''; } })
      .find((s) => s && new URL(s).hostname === host);
    if (asset) {
      log('Testing static asset caching');
      await fetchUrl(asset, { readBody: false, timeout: 10000 });
      const ar = await fetchUrl(asset, { readBody: false, timeout: 10000 });
      const acs = (ar.headers['cf-cache-status'] || '').toUpperCase();
      const maxAge = Number((ar.headers['cache-control'] || '').match(/max-age=(\d+)/)?.[1] || 0);
      checks.push(acs === 'HIT'
        ? check('cf.asset-cache', 'Static assets cached at edge', 'pass', `${acs} · max-age ${maxAge}s · ${asset.split('/').pop()}`, { weight: 2 })
        : check('cf.asset-cache', 'Static assets cached at edge', 'warn', `cf-cache-status ${acs || 'none'} on ${asset.split('/').pop()} after a warm-up request.`, { weight: 2, fix: 'Check Cache Rules and make sure origin is not sending Cache-Control: private/no-store for assets.' }));
      if (maxAge && maxAge < 86400) checks.push(check('cf.asset-ttl', 'Browser cache TTL for assets', 'warn', `max-age=${maxAge}s. Fingerprinted assets can use a year.`, { weight: 0.5 }));
    }

    // TLS floor
    log('Probing minimum TLS version');
    const legacy = await acceptsLegacyTls(host);
    checks.push(legacy === null
      ? check('cf.min-tls', 'Minimum TLS version', 'info', 'Could not probe TLS 1.0/1.1 from this machine. Add an API token to read the setting directly.')
      : legacy
        ? check('cf.min-tls', 'Minimum TLS version', 'fail', 'Edge still accepts TLS 1.0/1.1.', { weight: 2, fix: 'SSL/TLS → Edge Certificates → Minimum TLS Version: 1.2' })
        : check('cf.min-tls', 'Minimum TLS version', 'pass', 'TLS 1.0 and 1.1 are refused.', { weight: 2 }));
    checks.push(trace.tls === 'TLSv1.3' || !trace.tls
      ? check('cf.tls13', 'TLS 1.3', trace.tls ? 'pass' : 'info', trace.tls ? 'Negotiated TLS 1.3 at the edge.' : 'Edge trace unavailable.')
      : check('cf.tls13', 'TLS 1.3', 'warn', `Edge negotiated ${trace.tls}.`, { fix: 'Enable TLS 1.3 in SSL/TLS → Edge Certificates.' }));

    // Always use HTTPS
    const plain = await fetchUrl(`http://${host}/`, { maxRedirects: 0, readBody: false, timeout: 8000 });
    const loc = plain.headers.location || '';
    checks.push(plain.status >= 300 && plain.status < 400 && loc.startsWith('https:')
      ? check('cf.always-https', 'Always Use HTTPS', 'pass', `http:// answers ${plain.status} → https.`, { weight: 2 })
      : check('cf.always-https', 'Always Use HTTPS', 'fail', `http:// answered ${plain.status || 'nothing'} without redirecting to HTTPS.`, { weight: 2, fix: 'SSL/TLS → Edge Certificates → Always Use HTTPS: On' }));

    const hsts = h['strict-transport-security'] || '';
    const hstsAge = Number(hsts.match(/max-age=(\d+)/)?.[1] || 0);
    checks.push(hstsAge >= 15552000
      ? check('cf.hsts', 'HSTS at the edge', 'pass', hsts)
      : check('cf.hsts', 'HSTS at the edge', hsts ? 'warn' : 'fail', hsts ? `max-age is only ${hstsAge}s.` : 'HSTS not enabled.', { fix: 'SSL/TLS → Edge Certificates → HSTS: max-age ≥ 6 months, include subdomains.' }));

    checks.push(/h3/.test(h['alt-svc'] || '') || trace.http === 'http/3'
      ? check('cf.http3', 'HTTP/3 (QUIC)', 'pass', 'HTTP/3 is advertised.')
      : check('cf.http3', 'HTTP/3 (QUIC)', 'warn', 'HTTP/3 not advertised.', { fix: 'Network → HTTP/3 (with QUIC): On' }));

    const enc = await fetchUrl(page.finalUrl, { readBody: false, headers: { 'accept-encoding': 'br, zstd, gzip' }, timeout: 10000 });
    const ce = enc.headers['content-encoding'] || '';
    checks.push(/br|zstd/.test(ce)
      ? check('cf.compression', 'Brotli / Zstandard', 'pass', `content-encoding: ${ce}`)
      : check('cf.compression', 'Brotli / Zstandard', 'warn', `content-encoding: ${ce || 'none'}`, { fix: 'Enable Brotli/Zstandard compression in Cloudflare (Speed → Optimization / Compression Rules).' }));

    // Feature fingerprints
    const html = page.html;
    if (/rocket-loader\.min\.js/.test(html)) checks.push(check('cf.rocket', 'Rocket Loader', 'info', 'Rocket Loader is rewriting scripts. Test for breakage in interactive widgets and consider native defer instead.'));
    if (/email-decode\.min\.js|__cf_email__/.test(html)) checks.push(check('cf.email', 'Email obfuscation', 'info', 'Email Address Obfuscation is active (adds a small script).'));
    if (/static\.cloudflareinsights\.com\/beacon/.test(html)) checks.push(check('cf.analytics', 'Cloudflare Web Analytics', 'info', 'Privacy-first Web Analytics beacon detected.'));
    if (/challenges\.cloudflare\.com\/turnstile/.test(html)) checks.push(check('cf.turnstile', 'Turnstile', 'info', 'Cloudflare Turnstile CAPTCHA alternative is used on this page.'));
    if (/__cf_bm/.test(h['set-cookie'] || '')) checks.push(check('cf.bm', 'Bot management cookie', 'info', '__cf_bm cookie set (Bot Fight Mode / Bot Management).'));
    if (/cf-apo-via|cf-edge-cache/.test(Object.keys(h).join(' '))) checks.push(check('cf.apo', 'Automatic Platform Optimization', 'pass', 'APO headers present.'));

    // Origin exposure via sibling records
    log('Checking for origin IP exposure');
    const subs = ['direct', 'origin', 'ftp', 'cpanel', 'mail', 'webmail', 'dev', 'staging'];
    const exposed: string[] = [];
    await Promise.all(subs.map(async (s) => {
      const ips2 = await safe(dns.resolve4(`${s}.${apex}`), [] as string[]);
      const non = ips2.filter((ip) => !isCloudflareIp(ip));
      if (non.length) exposed.push(`${s}.${apex} → ${non.join(', ')}`);
    }));
    checks.push(exposed.length
      ? check('cf.origin-leak', 'Origin IP not exposed', 'warn', `${exposed.length} DNS record(s) resolve outside Cloudflare. If any share the web server, attackers can bypass the proxy.`, { items: exposed, weight: 1.5, fix: 'Proxy those records, move them to a separate host, and firewall the origin to Cloudflare IPs (or use Cloudflare Tunnel).' })
      : check('cf.origin-leak', 'Origin IP not exposed', 'pass', 'Common sibling hostnames do not reveal a non-Cloudflare IP.', { weight: 1.5 }));
  }

  // DNS hygiene (applies regardless of provider)
  log('Checking DNSSEC');
  const ds = await doh(apex, 'DS');
  const dsOk = Boolean(ds?.Answer?.length);
  checks.push(dsOk
    ? check('cf.dnssec', 'DNSSEC', 'pass', `DS record published for ${apex}.`, { weight: 1.5 })
    : check('cf.dnssec', 'DNSSEC', 'warn', `No DS record for ${apex}.`, { weight: 1.5, fix: fullSetup ? 'DNS → Settings → Enable DNSSEC, then add the DS record at your registrar.' : 'Enable DNSSEC with your DNS provider and registrar.' }));
  checks.push(caa.length
    ? check('cf.caa', 'CAA records', 'pass', caa.map((c) => c.issue || c.issuewild || c.iodef).filter(Boolean).join(', '), { weight: 0.5 })
    : check('cf.caa', 'CAA records', 'warn', 'No CAA records — any CA may issue certificates for this domain.', { weight: 0.5 }));
  checks.push(a6.length
    ? check('cf.ipv6', 'IPv6 (AAAA)', 'pass', `${a6.length} AAAA record(s).`, { weight: 0.5 })
    : check('cf.ipv6', 'IPv6 (AAAA)', 'warn', 'No AAAA records.', { weight: 0.5 }));
  if (mx.length) {
    const spf = await safe(dns.resolveTxt(apex), [] as string[][]);
    const dmarc = await safe(dns.resolveTxt(`_dmarc.${apex}`), [] as string[][]);
    const hasSpf = spf.some((r) => r.join('').startsWith('v=spf1'));
    const hasDmarc = dmarc.some((r) => r.join('').startsWith('v=DMARC1'));
    checks.push(hasSpf && hasDmarc
      ? check('cf.email-auth', 'SPF & DMARC', 'pass', 'Both records published.', { weight: 0.5 })
      : check('cf.email-auth', 'SPF & DMARC', 'warn', `Missing: ${[!hasSpf && 'SPF', !hasDmarc && 'DMARC'].filter(Boolean).join(', ')}.`, { weight: 0.5 }));
  }

  // Optional API review
  let zone: Record<string, unknown> | undefined;
  if (token) {
    log('Reading zone settings via Cloudflare API');
    const z = await cfApi(token, `/zones?name=${encodeURIComponent(apex)}`);
    const zr = (z.result as { id: string; name: string; plan?: { name: string }; status: string }[] | null)?.[0];
    if (!z.success || !zr) {
      checks.push(check('cf.api', 'Cloudflare API', 'warn', z.errors?.[0]?.message || `Token has no access to zone ${apex}.`, { fix: 'Create an API token with Zone → Zone Settings: Read and Zone: Read for this zone.' }));
    } else {
      const s = await cfApi(token, `/zones/${zr.id}/settings`);
      const settings = new Map(((s.result as CfSetting[]) || []).map((x) => [x.id, x.value]));
      zone = { name: zr.name, plan: zr.plan?.name, status: zr.status, settings: Object.fromEntries(settings) };
      checks.push(check('cf.api', 'Cloudflare API', 'pass', `Zone ${zr.name} · ${zr.plan?.name ?? ''} · ${zr.status}`));
      const want: [string, string, (v: unknown) => SL.Status, string][] = [
        ['ssl', 'SSL/TLS encryption mode', (v) => (v === 'strict' || v === 'origin_pull' ? 'pass' : v === 'full' ? 'warn' : 'fail'), 'Use Full (strict) so Cloudflare validates the origin certificate.'],
        ['always_use_https', 'Always Use HTTPS (setting)', (v) => (v === 'on' ? 'pass' : 'fail'), 'Turn on Always Use HTTPS.'],
        ['min_tls_version', 'Minimum TLS (setting)', (v) => (Number(v) >= 1.2 ? 'pass' : 'fail'), 'Set Minimum TLS Version to 1.2.'],
        ['tls_1_3', 'TLS 1.3 (setting)', (v) => (v === 'on' || v === 'zrt' ? 'pass' : 'warn'), 'Enable TLS 1.3.'],
        ['automatic_https_rewrites', 'Automatic HTTPS Rewrites', (v) => (v === 'on' ? 'pass' : 'warn'), 'Enable to fix mixed content automatically.'],
        ['http3', 'HTTP/3 (setting)', (v) => (v === 'on' ? 'pass' : 'warn'), 'Enable HTTP/3.'],
        ['early_hints', 'Early Hints', (v) => (v === 'on' ? 'pass' : 'warn'), 'Enable Early Hints (103) to preload critical assets.'],
        ['brotli', 'Brotli (setting)', (v) => (v === 'on' ? 'pass' : 'warn'), 'Enable Brotli.'],
        ['browser_check', 'Browser Integrity Check', (v) => (v === 'on' ? 'pass' : 'warn'), 'Enable Browser Integrity Check.'],
        ['development_mode', 'Development mode off', (v) => (v === 'off' ? 'pass' : 'fail'), 'Development mode bypasses the cache — turn it off in production.'],
        ['security_level', 'Security level', (v) => (v === 'essentially_off' || v === 'off' ? 'warn' : 'pass'), 'Use at least "low"; "under_attack" only during attacks.'],
        ['opportunistic_encryption', 'Opportunistic Encryption', (v) => (v === 'on' ? 'pass' : 'warn'), 'Enable Opportunistic Encryption.'],
      ];
      for (const [id, title, judge, fix] of want) {
        if (!settings.has(id)) continue;
        const v = settings.get(id);
        const st = judge(v);
        checks.push(check(`cf.set.${id}`, title, st, `Current value: ${JSON.stringify(v)}`, { fix: st === 'pass' ? '' : fix }));
      }
      const d = await cfApi(token, `/zones/${zr.id}/dnssec`);
      const dstatus = (d.result as { status?: string } | null)?.status;
      if (dstatus) checks.push(check('cf.set.dnssec', 'DNSSEC (zone)', dstatus === 'active' ? 'pass' : 'warn', `Status: ${dstatus}`));
    }
  } else if (onCloudflare) {
    checks.push(check('cf.api', 'Zone settings review', 'info', 'Add a read-only Cloudflare API token in Settings to review SSL mode, development mode, security level and more.'));
  }

  return category('cloudflare', checks, { onCloudflare, fullSetup, colo, nameservers: ns, ips, trace, zone });
}
