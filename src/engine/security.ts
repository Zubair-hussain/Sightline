/**
 * Cloudflare security — what an attacker sees from outside, plus Cloudflare's own protection
 * settings when a read-only API token is available.
 *
 * Without a token (any site): security headers not covered by "Website health", security.txt,
 * email spoofing protection (SPF, DMARC, MTA-STS), subdomain takeover via dangling CNAMEs, and
 * origin servers revealed by certificate-transparency logs.
 * With a token: WAF managed rules, custom firewall rules, rate limiting, Bot Fight Mode, leaked
 * credential detection and Authenticated Origin Pulls.
 *
 * Every request here is an ordinary read (DNS lookups and GETs); nothing is sent that a browser
 * or a search engine would not send.
 */
import { promises as dns } from 'node:dns';
import { check, category, fetchUrl } from './util';
import { cfApi, isCloudflareIp, registrableDomain } from './cloudflare';
import type { Page } from './page';

export interface SecurityData {
  onCloudflare: boolean;
  headers: Record<string, string | null>;
  securityTxt: { url: string; contact: string[]; expires: string | null } | null;
  email: { mx: boolean; spf: string | null; dmarc: string | null; mtaSts: string | null };
  subdomainsChecked: number;
  takeover: string[];
  ctHosts: number;
  exposedOrigins: string[];
  waf?: { managed: number; custom: number; rateLimits: number; botFight: boolean | null; leakedCredentials: boolean | null };
}

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try { return await p; } catch { return fallback; }
}

/** Runs `fn` over `items` with at most `limit` in flight. */
async function pool<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

// ---------------------------------------------------------------- headers

export function parseCsp(value: string): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const part of value.split(';')) {
    const [name, ...vals] = part.trim().split(/\s+/);
    if (name && !m.has(name.toLowerCase())) m.set(name.toLowerCase(), vals);
  }
  return m;
}

/** Weaknesses in a Content-Security-Policy, in plain words. Empty when the policy is strong. */
export function cspWeaknesses(value: string): string[] {
  const csp = parseCsp(value);
  const script = csp.get('script-src') ?? csp.get('default-src');
  const issues: string[] = [];
  if (!script) issues.push('No script-src or default-src, so scripts from anywhere can run.');
  else {
    const hasNonceOrHash = script.some((s) => /^'(nonce|sha(256|384|512))-/i.test(s));
    const strictDynamic = script.includes("'strict-dynamic'");
    if (script.includes("'unsafe-inline'") && !hasNonceOrHash && !strictDynamic) issues.push("script-src allows 'unsafe-inline', so injected inline scripts can run.");
    if (script.includes("'unsafe-eval'")) issues.push("script-src allows 'unsafe-eval' (eval and new Function).");
    // With a nonce or hash plus 'strict-dynamic', CSP3 browsers ignore host sources such as https: (they are fallbacks for old browsers).
    if (!(strictDynamic && hasNonceOrHash) && script.some((s) => s === '*' || s === 'https:' || s === 'http:' || s === 'data:')) issues.push('script-src allows scripts from any host or from data: URLs.');
  }
  const obj = csp.get('object-src') ?? csp.get('default-src');
  if (!obj || !obj.includes("'none'")) issues.push("object-src is not 'none' (plugins such as <object> and <embed> can load).");
  if (!csp.has('base-uri')) issues.push('No base-uri, so an injected <base> tag can redirect relative URLs.');
  return issues;
}

function headerChecks(h: Record<string, string>, checks: SL.Check[]): Record<string, string | null> {
  const get = (k: string) => h[k] ?? null;
  const csp = get('content-security-policy');
  const cspRo = get('content-security-policy-report-only');
  if (csp) {
    const weak = cspWeaknesses(csp);
    checks.push(weak.length
      ? check('sec.csp', 'Content-Security-Policy', 'warn', `A policy is set, but ${weak.length} weakness(es) reduce its protection against script injection (XSS).`, { weight: 2, items: weak, fix: "Use nonces or hashes instead of 'unsafe-inline', drop 'unsafe-eval', and add object-src 'none' and base-uri 'self'." })
      : check('sec.csp', 'Content-Security-Policy', 'pass', 'A strict policy limits which scripts can run.', { weight: 2 }));
  } else {
    checks.push(check('sec.csp', 'Content-Security-Policy', 'warn', cspRo ? 'Only a report-only policy is set: violations are reported but nothing is blocked.' : 'No Content-Security-Policy header. If an attacker injects a script, the browser will run it.', { weight: 2, fix: "Start with Content-Security-Policy-Report-Only, fix what it reports, then enforce it. A good start: default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'." }));
  }

  const ref = (get('referrer-policy') || '').toLowerCase().split(',').pop()?.trim() || '';
  checks.push(!ref
    ? check('sec.referrer', 'Referrer-Policy', 'info', 'Not set. Modern browsers default to strict-origin-when-cross-origin, which is safe.', { weight: 0 })
    : /^(unsafe-url|no-referrer-when-downgrade)$/.test(ref)
      ? check('sec.referrer', 'Referrer-Policy', 'warn', `"${ref}" sends full page addresses, including query strings, to other sites.`, { weight: 0.5, fix: 'Use Referrer-Policy: strict-origin-when-cross-origin.' })
      : check('sec.referrer', 'Referrer-Policy', 'pass', ref, { weight: 0.5 }));

  checks.push(get('permissions-policy')
    ? check('sec.permissions', 'Permissions-Policy', 'pass', 'Browser features such as camera and location are restricted.', { weight: 0.5 })
    : check('sec.permissions', 'Permissions-Policy', 'warn', 'Not set. Embedded third-party code can ask for camera, microphone or location.', { weight: 0.5, fix: 'Add Permissions-Policy: camera=(), microphone=(), geolocation=() (allow only what the site uses).' }));

  checks.push(/nosniff/i.test(get('x-content-type-options') || '')
    ? check('sec.nosniff', 'X-Content-Type-Options', 'pass', 'nosniff', { weight: 0.5 })
    : check('sec.nosniff', 'X-Content-Type-Options', 'warn', 'Not set to nosniff. Browsers may guess file types and run uploaded files as scripts.', { weight: 0.5, fix: 'Add X-Content-Type-Options: nosniff.' }));

  const coop = get('cross-origin-opener-policy');
  checks.push(coop && /same-origin/i.test(coop)
    ? check('sec.coop', 'Cross-Origin-Opener-Policy', 'pass', coop, { weight: 0.25 })
    : check('sec.coop', 'Cross-Origin-Opener-Policy', 'info', coop ? `"${coop}"` : 'Not set. Pages this site opens in new windows can keep a handle to it.', { weight: 0, fix: 'Consider Cross-Origin-Opener-Policy: same-origin (use same-origin-allow-popups if you rely on OAuth or payment pop-ups).' }));

  return { 'content-security-policy': csp, 'referrer-policy': get('referrer-policy'), 'permissions-policy': get('permissions-policy'), 'x-content-type-options': get('x-content-type-options'), 'cross-origin-opener-policy': coop };
}

// ---------------------------------------------------------------- security.txt

export function parseSecurityTxt(body: string): { contact: string[]; expires: string | null } {
  const contact: string[] = [];
  let expires: string | null = null;
  for (const line of body.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z-]+)\s*:\s*(.+?)\s*$/);
    if (!m) continue;
    if (/^contact$/i.test(m[1])) contact.push(m[2]);
    if (/^expires$/i.test(m[1]) && !expires) expires = m[2];
  }
  return { contact, expires };
}

async function securityTxt(origin: string, checks: SL.Check[], now: Date): Promise<SecurityData['securityTxt']> {
  for (const path of ['/.well-known/security.txt', '/security.txt']) {
    const r = await fetchUrl(origin + path, { timeout: 8000, maxBytes: 64 * 1024 });
    if (r.status !== 200 || /<html/i.test(r.body.slice(0, 500))) continue;
    const parsed = parseSecurityTxt(r.body);
    if (!parsed.contact.length) continue;
    const exp = parsed.expires ? new Date(parsed.expires) : null;
    const expired = exp && !Number.isNaN(exp.getTime()) && exp < now;
    checks.push(expired
      ? check('sec.security-txt', 'security.txt', 'warn', `Found at ${path}, but it expired on ${parsed.expires}.`, { weight: 0.5, fix: 'Update the Expires field (at most a year ahead) so researchers trust the contact details.' })
      : check('sec.security-txt', 'security.txt', 'pass', `Security researchers can reach you: ${parsed.contact.join(', ')}`, { weight: 0.5 }));
    return { url: origin + path, ...parsed };
  }
  checks.push(check('sec.security-txt', 'security.txt', 'warn', 'No /.well-known/security.txt, so people who find a vulnerability do not know how to report it.', { weight: 0.5, fix: 'Publish /.well-known/security.txt with Contact: mailto:security@your-domain and Expires: (a date within a year). See securitytxt.org.' }));
  return null;
}

// ---------------------------------------------------------------- email spoofing

export function spfVerdict(record: string | null, hasMx: boolean): { status: SL.Status; detail: string } {
  if (!record) return hasMx
    ? { status: 'fail', detail: 'No SPF record: anyone can send email that claims to come from this domain.' }
    : { status: 'warn', detail: 'No SPF record. This domain sends no email, so publish "v=spf1 -all" to stop others pretending it does.' };
  const all = record.match(/([-~?+]?)all\b/i);
  if (!all) return { status: 'warn', detail: `SPF has no "all" rule, so unlisted senders are not rejected: ${record}` };
  const q = all[1] || '+';
  if (q === '-') return { status: 'pass', detail: record };
  if (q === '~') return { status: 'warn', detail: `SPF ends in ~all (soft fail): spoofed mail is usually still delivered. ${record}` };
  return { status: 'fail', detail: `SPF ends in ${q}all, which lets any server send as this domain: ${record}` };
}

export function dmarcVerdict(record: string | null, hasMx: boolean): { status: SL.Status; detail: string } {
  if (!record) return { status: hasMx ? 'fail' : 'warn', detail: 'No DMARC record, so receiving servers have no instruction to reject spoofed email.' };
  const tag = (k: string) => record.match(new RegExp(`(?:^|;)\\s*${k}\\s*=\\s*([^;\\s]+)`, 'i'))?.[1]?.toLowerCase();
  const p = tag('p');
  const pct = Number(tag('pct') ?? 100);
  if (p === 'reject' || p === 'quarantine') return pct < 100
    ? { status: 'warn', detail: `p=${p}, but only for ${pct}% of mail (pct=${pct}).` }
    : { status: 'pass', detail: record };
  return { status: 'warn', detail: `p=${p ?? 'missing'}: spoofed mail is only reported, not blocked. ${record}` };
}

async function emailChecks(apex: string, checks: SL.Check[]): Promise<SecurityData['email']> {
  const [mx, txt, dmarcTxt, mtaTxt] = await Promise.all([
    safe(dns.resolveMx(apex), [] as { exchange: string }[]),
    safe(dns.resolveTxt(apex), [] as string[][]),
    safe(dns.resolveTxt(`_dmarc.${apex}`), [] as string[][]),
    safe(dns.resolveTxt(`_mta-sts.${apex}`), [] as string[][]),
  ]);
  const hasMx = mx.length > 0;
  const spfs = txt.map((r) => r.join('')).filter((r) => /^v=spf1\b/i.test(r));
  const spf = spfs[0] ?? null;
  const dmarc = dmarcTxt.map((r) => r.join('')).find((r) => /^v=DMARC1\b/i.test(r)) ?? null;
  const mtaSts = mtaTxt.map((r) => r.join('')).find((r) => /^v=STSv1\b/i.test(r)) ?? null;

  if (spfs.length > 1) checks.push(check('sec.spf', 'SPF stops email spoofing', 'fail', `${spfs.length} SPF records: receivers treat this as an error and ignore SPF entirely.`, { weight: 1, items: spfs, fix: 'Merge them into a single v=spf1 record.' }));
  else {
    const v = spfVerdict(spf, hasMx);
    checks.push(check('sec.spf', 'SPF stops email spoofing', v.status, v.detail, { weight: 1, fix: v.status === 'pass' ? '' : hasMx ? 'List your mail providers and end the record with -all, e.g. v=spf1 include:_spf.google.com -all.' : 'Publish the TXT record v=spf1 -all.' }));
  }
  const d = dmarcVerdict(dmarc, hasMx);
  checks.push(check('sec.dmarc', 'DMARC blocks spoofed email', d.status, d.detail, { weight: 1, fix: d.status === 'pass' ? '' : 'Publish _dmarc TXT "v=DMARC1; p=quarantine; rua=mailto:dmarc@your-domain", check the reports for a few weeks, then move to p=reject.' }));
  if (hasMx) {
    checks.push(mtaSts
      ? check('sec.mta-sts', 'MTA-STS (encrypted mail delivery)', 'pass', mtaSts, { weight: 0.25 })
      : check('sec.mta-sts', 'MTA-STS (encrypted mail delivery)', 'info', 'Not published. Incoming mail can be downgraded to unencrypted delivery.', { weight: 0, fix: 'Publish _mta-sts TXT "v=STSv1; id=1" and https://mta-sts.your-domain/.well-known/mta-sts.txt with mode: enforce.' }));
  }
  return { mx: hasMx, spf, dmarc, mtaSts };
}

// ---------------------------------------------------------------- subdomain takeover

/** Hosting services that show a recognisable page when the name points at an unclaimed resource. */
export const TAKEOVER_SIGNS: { service: string; cname: RegExp; body: RegExp }[] = [
  { service: 'GitHub Pages', cname: /\.github\.io$/i, body: /There isn't a GitHub Pages site here/i },
  { service: 'Heroku', cname: /\.(herokuapp|herokudns)\.com$/i, body: /No such app|herokucdn\.com\/error-pages\/no-such-app/i },
  { service: 'Amazon S3', cname: /\.s3[.-].*amazonaws\.com$|^s3\.amazonaws\.com$/i, body: /NoSuchBucket|The specified bucket does not exist/i },
  { service: 'Azure', cname: /\.(azurewebsites\.net|cloudapp\.net|cloudapp\.azure\.com|trafficmanager\.net|blob\.core\.windows\.net|azureedge\.net)$/i, body: /404 Web Site not found|The resource you are looking for has been removed/i },
  { service: 'Netlify', cname: /\.netlify\.(app|com)$/i, body: /Not Found - Request ID/i },
  { service: 'Vercel', cname: /\.vercel(-dns)?\.(app|com)$/i, body: /DEPLOYMENT_NOT_FOUND|The deployment could not be found/i },
  { service: 'Shopify', cname: /\.myshopify\.com$/i, body: /Sorry, this shop is currently unavailable/i },
  { service: 'Fastly', cname: /\.fastly\.net$/i, body: /Fastly error: unknown domain/i },
  { service: 'Surge', cname: /\.surge\.sh$/i, body: /project not found/i },
  { service: 'Bitbucket', cname: /\.bitbucket\.io$/i, body: /Repository not found/i },
  { service: 'Ghost', cname: /\.ghost\.io$/i, body: /Domain error|The thing you were looking for is no longer here/i },
  { service: 'Pantheon', cname: /\.pantheonsite\.io$/i, body: /The gods are wise, but do not know of the site which you seek/i },
  { service: 'Tumblr', cname: /^domains\.tumblr\.com$/i, body: /Whatever you were looking for doesn't currently exist at this address/i },
  { service: 'Webflow', cname: /proxy-ssl\.webflow\.com$/i, body: /The page you are looking for doesn't exist or has been moved/i },
];

const COMMON_SUBDOMAINS = ['www', 'blog', 'shop', 'store', 'docs', 'help', 'support', 'status', 'dev', 'staging', 'test', 'beta', 'app', 'api', 'cdn', 'assets', 'static', 'media', 'm', 'portal', 'admin', 'old', 'new', 'demo', 'mail'];

export interface DanglingFacts {
  host: string;
  target: string;
  apex: string;
  /** the CNAME target has A or AAAA records */
  resolves: boolean;
  /** a known hosting service matched the target */
  service?: string;
  /** that service's "unclaimed resource" page was served for the host */
  unclaimedPage: boolean;
  /** the target's registrable domain exists (has name servers) */
  targetDomainRegistered: boolean;
}

/**
 * Whether a CNAME can be taken over by an outsider, and why. A broken CNAME inside your own
 * domain is untidy but not claimable; it becomes a takeover only when the target is a hosting
 * resource someone else can create, or a domain anyone can still register.
 */
export function takeoverVerdict(f: DanglingFacts): string | null {
  if (registrableDomain(f.target) === f.apex) return null;
  if (!f.targetDomainRegistered) return `${f.host} → ${f.target} (${registrableDomain(f.target)} is not registered; whoever buys it controls ${f.host})`;
  if (f.service && (!f.resolves || f.unclaimedPage)) return `${f.host} → ${f.target} (${f.service} shows the resource is unclaimed; anyone can create it and serve pages on ${f.host})`;
  return null;
}

async function takeoverCheck(host: string, apex: string): Promise<string | null> {
  const cnames = await safe(dns.resolveCname(host), [] as string[]);
  const target = cnames[0]?.replace(/\.$/, '').toLowerCase();
  if (!target || registrableDomain(target) === apex) return null;
  const sign = TAKEOVER_SIGNS.find((s) => s.cname.test(target));
  const resolves = (await safe(dns.resolve4(target), [] as string[])).length + (await safe(dns.resolve6(target), [] as string[])).length > 0;
  const targetDomainRegistered = resolves || (await safe(dns.resolveNs(registrableDomain(target)), [] as string[])).length > 0;
  let unclaimedPage = false;
  if (sign && resolves) {
    const r = await fetchUrl(`https://${host}/`, { timeout: 6000, maxBytes: 64 * 1024 });
    const body = r.body || (await fetchUrl(`http://${host}/`, { timeout: 6000, maxBytes: 64 * 1024 })).body;
    unclaimedPage = sign.body.test(body);
  }
  return takeoverVerdict({ host, target, apex, resolves, service: sign?.service, unclaimedPage, targetDomainRegistered });
}

// ---------------------------------------------------------------- certificate transparency

/** Host names under `apex` that `names` lists, without wildcards. */
export function namesUnder(apex: string, names: string[]): string[] {
  const out = new Set<string>();
  for (const raw of names) for (const n of raw.split(/\s+/)) {
    const name = n.toLowerCase().replace(/\.$/, '');
    if (name && !name.startsWith('*') && (name === apex || name.endsWith(`.${apex}`))) out.add(name);
  }
  return [...out];
}

/**
 * Host names under `apex` from certificate-transparency logs. Cert Spotter (SSLMate) is current but
 * returns a page of recent certificates; crt.sh is complete but slow and sometimes lags or times
 * out. Both are queried and merged; null only when neither answered.
 */
async function ctHostnames(apex: string, limit = 150): Promise<string[] | null> {
  const [spotter, crt] = await Promise.all([
    fetchUrl(`https://api.certspotter.com/v1/issuances?domain=${encodeURIComponent(apex)}&include_subdomains=true&expand=dns_names`, { timeout: 15000, maxBytes: 4 * 1024 * 1024 }),
    fetchUrl(`https://crt.sh/?q=${encodeURIComponent(`%.${apex}`)}&output=json`, { timeout: 20000, maxBytes: 8 * 1024 * 1024 }),
  ]);
  const names: string[] = [];
  let answered = false;
  try { if (spotter.status === 200) { names.push(...(JSON.parse(spotter.body) as { dns_names?: string[] }[]).flatMap((c) => c.dns_names ?? [])); answered = true; } } catch { /* ignore */ }
  try { if (crt.status === 200) { names.push(...(JSON.parse(crt.body) as { name_value?: string }[]).map((r) => r.name_value ?? '')); answered = true; } } catch { /* ignore */ }
  return answered ? namesUnder(apex, names).slice(0, limit) : null;
}

// ---------------------------------------------------------------- Cloudflare API

async function wafChecks(token: string, apex: string, checks: SL.Check[]): Promise<SecurityData['waf']> {
  const z = await cfApi(token, `/zones?name=${encodeURIComponent(apex)}`);
  const zone = (z.result as { id: string }[] | null)?.[0];
  if (!z.success || !zone) {
    checks.push(check('sec.cf-api', 'Cloudflare security settings', 'info', z.errors?.[0]?.message || `The token cannot read zone ${apex}.`, { weight: 0, fix: 'Create a read-only API token with Zone: Read, Zone Settings: Read, Zone WAF: Read and Bot Management: Read for this zone.' }));
    return undefined;
  }
  const noAccess = (r: { success: boolean; errors?: { message: string }[] }) => !r.success && /auth|permission|forbidden|10000|9109/i.test(r.errors?.map((e) => e.message).join(' ') || '');
  const phase = async (name: string) => {
    const r = await cfApi(token, `/zones/${zone.id}/rulesets/phases/${name}/entrypoint`);
    if (noAccess(r)) return null;
    return ((r.result as { rules?: { enabled?: boolean }[] } | null)?.rules ?? []).filter((x) => x.enabled !== false).length;
  };
  const [managed, custom, rateLimits, bot, leaked, settings] = await Promise.all([
    phase('http_request_firewall_managed'), phase('http_request_firewall_custom'), phase('http_ratelimit'),
    cfApi(token, `/zones/${zone.id}/bot_management`), cfApi(token, `/zones/${zone.id}/leaked-credential-checks`),
    cfApi(token, `/zones/${zone.id}/settings/tls_client_auth`),
  ]);
  const permFix = 'Give the token Zone WAF: Read (and Bot Management: Read) to review this.';

  checks.push(managed == null
    ? check('sec.waf-managed', 'WAF managed rules', 'info', 'The token cannot read WAF rules.', { weight: 0, fix: permFix })
    : managed > 0
      ? check('sec.waf-managed', 'WAF managed rules', 'pass', `${managed} managed ruleset(s) deployed (common exploits such as SQL injection and known CVEs are blocked).`, { weight: 2 })
      : check('sec.waf-managed', 'WAF managed rules', 'fail', 'No managed WAF ruleset is deployed, so Cloudflare does not block known attack patterns.', { weight: 2, fix: 'Security → WAF → Managed rules: deploy the Cloudflare Managed Ruleset (Free plan: the Free Managed Ruleset).' }));
  if (custom != null) checks.push(check('sec.waf-custom', 'Custom firewall rules', custom > 0 ? 'pass' : 'info', custom > 0 ? `${custom} custom rule(s) active.` : 'No custom firewall rules.', { weight: 0, fix: custom > 0 ? '' : 'Consider rules that challenge traffic to /admin, /wp-login.php or your API from unexpected countries or ASNs.' }));
  if (rateLimits != null) checks.push(rateLimits > 0
    ? check('sec.rate-limit', 'Rate limiting', 'pass', `${rateLimits} rate-limiting rule(s) active.`, { weight: 1 })
    : check('sec.rate-limit', 'Rate limiting', 'warn', 'No rate-limiting rules, so login forms and APIs can be brute-forced or scraped.', { weight: 1, fix: 'Security → WAF → Rate limiting rules: limit requests to login, sign-up and API paths per IP.' }));

  const botFight = noAccess(bot) ? null : Boolean((bot.result as { fight_mode?: boolean } | null)?.fight_mode);
  if (botFight != null) checks.push(botFight
    ? check('sec.bot-fight', 'Bot Fight Mode', 'pass', 'Known bad bots are challenged.', { weight: 0.5 })
    : check('sec.bot-fight', 'Bot Fight Mode', 'warn', 'Off. Simple bots and scrapers reach the site unchallenged.', { weight: 0.5, fix: 'Security → Bots: turn on Bot Fight Mode (check that verified bots such as Googlebot are still allowed).' }));
  const leakedOn = noAccess(leaked) || !leaked.success ? null : Boolean((leaked.result as { enabled?: boolean } | null)?.enabled);
  if (leakedOn != null) checks.push(check('sec.leaked-credentials', 'Leaked credentials detection', leakedOn ? 'pass' : 'info', leakedOn ? 'Logins with passwords known from data breaches are flagged.' : 'Off.', { weight: 0, fix: leakedOn ? '' : 'Security → Settings: turn on Leaked credentials detection to flag logins that use breached passwords.' }));
  const aop = (settings.result as { value?: string } | null)?.value;
  if (aop) checks.push(check('sec.aop', 'Authenticated Origin Pulls', aop === 'on' ? 'pass' : 'info', aop === 'on' ? 'The origin only accepts connections that present Cloudflare\'s certificate.' : 'Off. Anyone who finds the origin IP can bypass Cloudflare.', { weight: 0, fix: aop === 'on' ? '' : 'Turn on Authenticated Origin Pulls and require the client certificate on the origin (or use Cloudflare Tunnel).' }));
  return { managed: managed ?? 0, custom: custom ?? 0, rateLimits: rateLimits ?? 0, botFight, leakedCredentials: leakedOn };
}

// ---------------------------------------------------------------- audit

export async function auditSecurity(page: Page, token: string | undefined, log: (s: string) => void, now = new Date()): Promise<SL.Category<SecurityData>> {
  const checks: SL.Check[] = [];
  const url = new URL(page.finalUrl);
  const host = url.hostname;
  const apex = registrableDomain(host);
  const h = page.headers;

  log('Checking security headers');
  const headers = headerChecks(h, checks);

  log('Looking for security.txt');
  const sec = await securityTxt(url.origin, checks, now);

  log('Checking email spoofing protection');
  const email = await emailChecks(apex, checks);

  const ips = [...await safe(dns.resolve4(host), [] as string[]), ...await safe(dns.resolve6(host), [] as string[])];
  const onCloudflare = Boolean(h['cf-ray']) || /cloudflare/i.test(h.server || '') || ips.some(isCloudflareIp);

  log('Reading certificate-transparency logs');
  const ct = await ctHostnames(apex);
  const hosts = [...new Set([...COMMON_SUBDOMAINS.map((s) => `${s}.${apex}`), ...(ct ?? [])])].filter((x) => x !== host).slice(0, 120);

  log(`Checking ${hosts.length} subdomains for takeover and exposed origins`);
  const [takeover, exposed] = await Promise.all([
    pool(hosts, 8, (name) => takeoverCheck(name, apex)).then((r) => r.filter((x): x is string => Boolean(x))),
    onCloudflare && ct ? pool(ct.filter((x) => x !== host).slice(0, 60), 8, async (name) => {
      const a = await safe(dns.resolve4(name), [] as string[]);
      const non = a.filter((ip) => !isCloudflareIp(ip));
      return non.length ? `${name} → ${non.join(', ')}` : null;
    }).then((r) => r.filter((x): x is string => Boolean(x))) : Promise.resolve([] as string[]),
  ]);
  checks.push(takeover.length
    ? check('sec.takeover', 'Subdomain takeover', 'fail', `${takeover.length} subdomain(s) point at a resource that no longer exists. Anyone who claims it can publish pages on your domain.`, { weight: 3, items: takeover, fix: 'Delete the DNS record, or re-create the resource it points to, before someone else claims it.' })
    : check('sec.takeover', 'Subdomain takeover', 'pass', `${hosts.length} subdomains checked; none point at an unclaimed resource.`, { weight: 3 }));
  if (ct == null) checks.push(check('sec.ct', 'Certificate-transparency subdomains', 'info', 'Certificate-transparency logs (Cert Spotter and crt.sh) could not be read right now, so only common subdomain names were checked.', { weight: 0 }));
  else if (!ct.length) checks.push(check('sec.ct', 'Certificate-transparency subdomains', 'info', `No host names for ${apex} in certificate-transparency logs yet (new certificates can take a few days to appear), so only common subdomain names were checked.`, { weight: 0 }));
  else if (onCloudflare) checks.push(exposed.length
    ? check('sec.ct', 'Origins revealed by certificates', 'warn', `${exposed.length} host name(s) from public certificate logs resolve outside Cloudflare. If one is the web server, attackers can reach it directly and skip the WAF.`, { weight: 1.5, items: exposed, fix: 'Proxy these records through Cloudflare or move them off the web server, and firewall the origin so only Cloudflare IPs can connect (or use Cloudflare Tunnel).' })
    : check('sec.ct', 'Origins revealed by certificates', 'pass', `${ct.length} host name(s) found in certificate logs; none reveal a non-Cloudflare IP.`, { weight: 1.5 }));
  else checks.push(check('sec.ct', 'Certificate-transparency subdomains', 'info', `${ct.length} host name(s) for ${apex} appear in public certificate logs. The site is not behind Cloudflare, so origin exposure does not apply.`, { weight: 0 }));

  let waf: SecurityData['waf'];
  if (token) {
    log('Reading Cloudflare security settings');
    waf = await wafChecks(token, apex, checks);
  } else if (onCloudflare) {
    checks.push(check('sec.cf-api', 'Cloudflare security settings', 'info', 'Add a read-only Cloudflare API token in Settings to review WAF rules, rate limiting, Bot Fight Mode and leaked-credential detection.', { weight: 0 }));
  }

  return category('security', checks, { onCloudflare, headers, securityTxt: sec, email, subdomainsChecked: hosts.length, takeover, ctHosts: ct?.length ?? 0, exposedOrigins: exposed, waf });
}
