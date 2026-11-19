import * as tls from 'node:tls';
import { check, category, fetchUrl, fmtBytes } from './util';
import { clean, type Page } from './page';

export interface TlsInfo { protocol: string | null; issuer: string; validTo: string; daysLeft: number; subject: string; altNames: string }

export function getTlsInfo(host: string): Promise<TlsInfo | null> {
  return new Promise((resolve) => {
    const socket = tls.connect({ host, port: 443, servername: host, timeout: 10000, rejectUnauthorized: false }, () => {
      const cert = socket.getPeerCertificate();
      const validTo = cert.valid_to;
      resolve({
        protocol: socket.getProtocol(),
        issuer: [cert.issuer?.O, cert.issuer?.CN].filter(Boolean).join(' — '),
        subject: String(cert.subject?.CN ?? ''),
        validTo,
        daysLeft: Math.floor((new Date(validTo).getTime() - Date.now()) / 86400000),
        altNames: cert.subjectaltname ?? '',
      });
      socket.end();
    });
    socket.on('error', () => resolve(null));
    socket.on('timeout', () => { socket.destroy(); resolve(null); });
  });
}

export interface WebsiteData {
  status: number;
  server: string;
  htmlBytes: number;
  ttfbMs: number | null;
  tls: TlsInfo | null;
  headers: Record<string, string>;
}

const SECURITY_HEADERS: [string, string, string, number][] = [
  ['strict-transport-security', 'HSTS', 'Add Strict-Transport-Security: max-age=31536000; includeSubDomains', 2],
  ['content-security-policy', 'Content-Security-Policy', 'Define a CSP to mitigate XSS and data injection.', 2],
  ['x-content-type-options', 'X-Content-Type-Options', 'Send X-Content-Type-Options: nosniff', 1],
  ['referrer-policy', 'Referrer-Policy', 'Send Referrer-Policy: strict-origin-when-cross-origin', 1],
  ['permissions-policy', 'Permissions-Policy', 'Restrict powerful features, e.g. Permissions-Policy: camera=(), geolocation=()', 0.5],
];

export async function auditWebsite(page: Page, log: (s: string) => void): Promise<SL.Category<WebsiteData>> {
  const { $, headers, res, finalUrl } = page;
  const checks: SL.Check[] = [];
  const u = new URL(finalUrl);

  // Status & redirects
  checks.push(res.status === 200
    ? check('web.status', 'HTTP status', 'pass', `200 OK in ${res.timeMs} ms.`, { weight: 3 })
    : check('web.status', 'HTTP status', res.status >= 400 ? 'fail' : 'warn', `Responded ${res.status}.`, { weight: 3 }));
  const hops = res.chain.length - 1;
  checks.push(hops > 1
    ? check('web.redirects', 'Redirect chain', 'warn', `${hops} redirects before the final page.`, { items: res.chain.map((c) => `${c.status}  ${c.url}`), fix: 'Collapse to a single redirect.' })
    : check('web.redirects', 'Redirect chain', 'pass', hops === 1 ? `1 redirect: ${res.chain[0].url} → ${finalUrl}` : 'No redirects.', { items: hops ? res.chain.map((c) => `${c.status}  ${c.url}`) : [] }));

  // HTTPS
  checks.push(u.protocol === 'https:'
    ? check('web.https', 'Served over HTTPS', 'pass', 'Final URL uses HTTPS.', { weight: 3 })
    : check('web.https', 'Served over HTTPS', 'fail', 'Page is served over plain HTTP.', { weight: 3 }));
  log('Checking HTTP → HTTPS redirect');
  const httpRes = await fetchUrl(`http://${u.host}${u.pathname}`, { timeout: 10000, readBody: false, maxRedirects: 5 });
  checks.push(httpRes.finalUrl.startsWith('https:')
    ? check('web.https-redirect', 'HTTP redirects to HTTPS', 'pass', `http:// → ${httpRes.finalUrl}`, { weight: 2 })
    : check('web.https-redirect', 'HTTP redirects to HTTPS', httpRes.status === 0 ? 'info' : 'fail', httpRes.status === 0 ? 'Port 80 not reachable.' : 'http:// does not redirect to https://.', { weight: 2 }));

  // TLS certificate
  let tlsInfo: TlsInfo | null = null;
  if (u.protocol === 'https:') {
    log('Inspecting TLS certificate');
    tlsInfo = await getTlsInfo(u.hostname);
    if (tlsInfo) {
      checks.push(tlsInfo.daysLeft < 0
        ? check('web.cert', 'TLS certificate', 'fail', `Expired on ${tlsInfo.validTo}.`, { weight: 3 })
        : tlsInfo.daysLeft < 14
          ? check('web.cert', 'TLS certificate', 'warn', `Expires in ${tlsInfo.daysLeft} days (${tlsInfo.validTo}).`, { weight: 3 })
          : check('web.cert', 'TLS certificate', 'pass', `Valid for ${tlsInfo.daysLeft} more days · ${tlsInfo.issuer}`, { weight: 3 }));
      const p = tlsInfo.protocol || '';
      checks.push(p === 'TLSv1.3'
        ? check('web.tls', 'TLS protocol', 'pass', 'Negotiated TLS 1.3.')
        : check('web.tls', 'TLS protocol', p === 'TLSv1.2' ? 'warn' : 'fail', `Negotiated ${p || 'unknown'}.`, { fix: 'Enable TLS 1.3 on your server or CDN.' }));
    } else {
      checks.push(check('web.cert', 'TLS certificate', 'warn', 'Could not complete a TLS handshake for inspection.'));
    }
  }

  // Security headers
  for (const [h, name, fix, w] of SECURITY_HEADERS) {
    const v = headers[h];
    checks.push(v
      ? check(`web.h.${h}`, name, 'pass', v.slice(0, 140), { weight: w })
      : check(`web.h.${h}`, name, 'fail', 'Header not set.', { weight: w, fix }));
  }
  const xfo = headers['x-frame-options'];
  const frameAnc = /frame-ancestors/i.test(headers['content-security-policy'] || '');
  checks.push(xfo || frameAnc
    ? check('web.h.clickjacking', 'Clickjacking protection', 'pass', xfo ? `X-Frame-Options: ${xfo}` : 'CSP frame-ancestors set.')
    : check('web.h.clickjacking', 'Clickjacking protection', 'fail', 'Neither X-Frame-Options nor CSP frame-ancestors.', { fix: 'Send X-Frame-Options: SAMEORIGIN or CSP frame-ancestors \'self\'.' }));
  const leaks = ['x-powered-by', 'x-aspnet-version', 'x-aspnetmvc-version'].filter((h) => headers[h]);
  const serverVer = /\d/.test(headers.server || '') ? headers.server : '';
  checks.push(leaks.length || serverVer
    ? check('web.h.leak', 'Technology disclosure', 'warn', 'Headers reveal server technology versions.', { items: [...leaks.map((h) => `${h}: ${headers[h]}`), ...(serverVer ? [`server: ${serverVer}`] : [])], weight: 0.5 })
    : check('web.h.leak', 'Technology disclosure', 'pass', 'No version-revealing headers.', { weight: 0.5 }));

  // Cookies
  const setCookie = headers['set-cookie'];
  if (setCookie) {
    const cookies = setCookie.split(/,(?=\s*[^;=\s]+=)/);
    const insecureCookies = cookies.filter((c) => !/;\s*secure/i.test(c) || !/;\s*samesite/i.test(c)).map((c) => c.split('=')[0].trim());
    checks.push(insecureCookies.length
      ? check('web.cookies', 'Cookie flags', 'warn', `${insecureCookies.length} cookie(s) missing Secure or SameSite.`, { items: insecureCookies })
      : check('web.cookies', 'Cookie flags', 'pass', `${cookies.length} cookie(s) set with Secure and SameSite.`));
  }

  // Compression & caching
  log('Checking compression');
  const enc = await fetchUrl(finalUrl, { timeout: 12000, readBody: false, headers: { 'accept-encoding': 'br, gzip, zstd' } });
  const ce = enc.headers['content-encoding'] || '';
  checks.push(/br|zstd/.test(ce)
    ? check('web.compression', 'Text compression', 'pass', `content-encoding: ${ce}`, { weight: 1.5 })
    : ce.includes('gzip')
      ? check('web.compression', 'Text compression', 'warn', 'gzip only — Brotli or zstd would be ~15–20% smaller.', { weight: 1.5 })
      : check('web.compression', 'Text compression', 'fail', 'HTML is served uncompressed.', { weight: 1.5, fix: 'Enable Brotli/gzip on your server or CDN.' }));
  const cc = headers['cache-control'] || '';
  checks.push(cc
    ? check('web.cache', 'Cache-Control on HTML', 'pass', cc, { weight: 0.5 })
    : check('web.cache', 'Cache-Control on HTML', 'warn', 'No Cache-Control header.', { weight: 0.5 }));
  const altSvc = headers['alt-svc'] || '';
  checks.push(/h3/.test(altSvc)
    ? check('web.http3', 'HTTP/3 advertised', 'pass', `alt-svc: ${altSvc.slice(0, 80)}`, { weight: 0.5 })
    : check('web.http3', 'HTTP/3 advertised', 'warn', 'No HTTP/3 (alt-svc h3) advertised.', { weight: 0.5 }));

  // Response time
  const ttfb = res.ttfbMs ?? res.timeMs;
  checks.push(ttfb < 600
    ? check('web.ttfb', 'Server response time', 'pass', `${ttfb} ms to first byte.`, { weight: 2 })
    : check('web.ttfb', 'Server response time', ttfb < 1800 ? 'warn' : 'fail', `${ttfb} ms to first byte (target < 600 ms).`, { weight: 2 }));

  // Markup
  const html = page.html;
  checks.push(/^\s*<!doctype html>/i.test(html)
    ? check('web.doctype', 'HTML5 doctype', 'pass', '<!DOCTYPE html> present.', { weight: 0.5 })
    : check('web.doctype', 'HTML5 doctype', 'warn', 'Missing or non-standard doctype (quirks mode risk).', { weight: 0.5 }));
  const charset = $('meta[charset]').attr('charset') || (headers['content-type'] || '').match(/charset=([^;]+)/i)?.[1];
  checks.push(charset
    ? check('web.charset', 'Character encoding', 'pass', String(charset), { weight: 0.5 })
    : check('web.charset', 'Character encoding', 'warn', 'No charset declared.', { weight: 0.5 }));
  checks.push(res.bytes < 200 * 1024
    ? check('web.html-size', 'HTML size', 'pass', fmtBytes(res.bytes))
    : check('web.html-size', 'HTML size', res.bytes < 600 * 1024 ? 'warn' : 'fail', `${fmtBytes(res.bytes)} of HTML (target < 200 KB).`));

  const blocking = $('head script[src]').filter((_, el) => !$(el).attr('async') && !$(el).attr('defer') && $(el).attr('type') !== 'module').map((_, el) => $(el).attr('src') || '').get();
  checks.push(blocking.length
    ? check('web.blocking', 'Render-blocking scripts', blocking.length > 2 ? 'fail' : 'warn', `${blocking.length} synchronous script(s) in <head>.`, { items: blocking, fix: 'Add defer or async, or move scripts to the end of <body>.', weight: 1.5 })
    : check('web.blocking', 'Render-blocking scripts', 'pass', 'No synchronous scripts in <head>.', { weight: 1.5 }));

  const imgs = $('img');
  const noDims = imgs.filter((_, el) => !$(el).attr('width') || !$(el).attr('height')).length;
  if (imgs.length) checks.push(noDims
    ? check('web.img-dims', 'Image dimensions', noDims / imgs.length > 0.3 ? 'warn' : 'pass', `${noDims} of ${imgs.length} images lack width/height (layout shift risk).`)
    : check('web.img-dims', 'Image dimensions', 'pass', 'All images declare width and height.'));
  const lazyable = imgs.length > 3 ? imgs.slice(3) : null;
  if (lazyable) {
    const notLazy = lazyable.filter((_, el) => $(el).attr('loading') !== 'lazy').length;
    checks.push(notLazy > lazyable.length / 2
      ? check('web.lazy', 'Lazy-loaded images', 'warn', `${notLazy} below-the-fold candidates are not loading="lazy".`, { weight: 0.5 })
      : check('web.lazy', 'Lazy-loaded images', 'pass', 'Offscreen images use lazy loading.', { weight: 0.5 }));
  }
  const legacyFormats = imgs.map((_, el) => $(el).attr('src') || '').get().filter((s) => /\.(jpe?g|png|gif|bmp)(\?|$)/i.test(s));
  if (legacyFormats.length > 3) checks.push(check('web.img-format', 'Modern image formats', 'warn', `${legacyFormats.length} images use JPEG/PNG/GIF.`, { items: legacyFormats.slice(0, 20), fix: 'Serve WebP or AVIF via <picture> or your CDN.', weight: 0.5 }));

  if (u.protocol === 'https:') {
    const mixed = $('script[src^="http:"], link[href^="http:"][rel="stylesheet"], img[src^="http:"], iframe[src^="http:"]').map((_, el) => $(el).attr('src') || $(el).attr('href') || '').get();
    checks.push(mixed.length
      ? check('web.mixed', 'Mixed content', 'fail', `${mixed.length} resource(s) load over http:// on an https page.`, { items: mixed, weight: 2 })
      : check('web.mixed', 'Mixed content', 'pass', 'No insecure subresources.', { weight: 2 }));
  }

  // Accessibility basics
  const inputs = $('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea');
  const unlabeled = inputs.filter((_, el) => {
    const e = $(el);
    const id = e.attr('id');
    return !e.attr('aria-label') && !e.attr('aria-labelledby') && !e.attr('title') && !(id && $(`label[for="${id}"]`).length) && !e.closest('label').length;
  }).length;
  if (inputs.length) checks.push(unlabeled
    ? check('web.a11y-labels', 'Form field labels', 'warn', `${unlabeled} of ${inputs.length} form field(s) have no label.`)
    : check('web.a11y-labels', 'Form field labels', 'pass', `All ${inputs.length} form fields are labelled.`));
  const unnamedButtons = $('button').filter((_, el) => !clean($(el).text()) && !$(el).attr('aria-label') && !$(el).attr('title')).length;
  if (unnamedButtons) checks.push(check('web.a11y-buttons', 'Button names', 'warn', `${unnamedButtons} button(s) have no accessible name.`));
  const deprecated = ['font', 'center', 'marquee', 'blink', 'frameset', 'big', 'strike', 'tt'].filter((t) => $(t).length);
  if (deprecated.length) checks.push(check('web.deprecated', 'Deprecated HTML', 'warn', `Uses <${deprecated.join('>, <')}>.`, { weight: 0.5 }));

  return category('website', checks, { status: res.status, server: headers.server || '', htmlBytes: res.bytes, ttfbMs: res.ttfbMs, tls: tlsInfo, headers });
}
