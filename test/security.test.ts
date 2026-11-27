import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cspWeaknesses, dmarcVerdict, parseSecurityTxt, spfVerdict, TAKEOVER_SIGNS, takeoverVerdict, namesUnder } from '../src/engine/security';

test('a strict Content-Security-Policy has no weaknesses', () => {
  assert.deepEqual(cspWeaknesses("default-src 'self'; script-src 'self' 'nonce-abc123'; object-src 'none'; base-uri 'self'"), []);
  // Google's recommended strict CSP: with a nonce and 'strict-dynamic', 'unsafe-inline' and https: are only fallbacks for old browsers.
  assert.deepEqual(cspWeaknesses("script-src 'nonce-x' 'strict-dynamic' 'unsafe-inline' https:; object-src 'none'; base-uri 'none'"), []);
  assert.ok(cspWeaknesses("script-src 'strict-dynamic' https:; object-src 'none'; base-uri 'none'").some((w) => w.includes('any host')), 'strict-dynamic without a nonce does not excuse https:');
});

test('weak CSP directives are each reported', () => {
  const weak = cspWeaknesses("default-src * 'unsafe-inline' 'unsafe-eval'");
  assert.ok(weak.some((w) => w.includes("'unsafe-inline'")));
  assert.ok(weak.some((w) => w.includes("'unsafe-eval'")));
  assert.ok(weak.some((w) => w.includes('any host')));
  assert.ok(weak.some((w) => w.includes('object-src')));
  assert.ok(weak.some((w) => w.includes('base-uri')));
  assert.ok(cspWeaknesses("img-src 'self'").some((w) => w.startsWith('No script-src')));
});

test('unsafe-inline next to a nonce or hash is not reported', () => {
  const weak = cspWeaknesses("script-src 'self' 'unsafe-inline' 'sha256-abc='; object-src 'none'; base-uri 'self'");
  assert.equal(weak.length, 0);
});

test('security.txt contact and expiry are parsed', () => {
  const parsed = parseSecurityTxt('# comment\nContact: mailto:security@example.com\nContact: https://example.com/report\nExpires: 2027-01-01T00:00:00.000Z\n');
  assert.deepEqual(parsed.contact, ['mailto:security@example.com', 'https://example.com/report']);
  assert.equal(parsed.expires, '2027-01-01T00:00:00.000Z');
  assert.deepEqual(parseSecurityTxt('<html>not found</html>').contact, []);
});

test('SPF verdicts follow the "all" qualifier', () => {
  assert.equal(spfVerdict('v=spf1 include:_spf.google.com -all', true).status, 'pass');
  assert.equal(spfVerdict('v=spf1 include:_spf.google.com ~all', true).status, 'warn');
  assert.equal(spfVerdict('v=spf1 +all', true).status, 'fail');
  assert.equal(spfVerdict('v=spf1 ?all', true).status, 'fail');
  assert.equal(spfVerdict('v=spf1 include:x.example', true).status, 'warn');
  assert.equal(spfVerdict(null, true).status, 'fail');
  assert.equal(spfVerdict(null, false).status, 'warn', 'a domain without mail should still publish v=spf1 -all');
});

test('DMARC verdicts follow the policy and pct', () => {
  assert.equal(dmarcVerdict('v=DMARC1; p=reject; rua=mailto:d@example.com', true).status, 'pass');
  assert.equal(dmarcVerdict('v=DMARC1; p=quarantine', true).status, 'pass');
  assert.equal(dmarcVerdict('v=DMARC1; p=quarantine; pct=25', true).status, 'warn');
  assert.equal(dmarcVerdict('v=DMARC1; p=none', true).status, 'warn');
  assert.equal(dmarcVerdict(null, true).status, 'fail');
  assert.equal(dmarcVerdict(null, false).status, 'warn');
});

test('takeover fingerprints match their own services only', () => {
  const find = (cname: string) => TAKEOVER_SIGNS.find((s) => s.cname.test(cname))?.service;
  assert.equal(find('acme.github.io'), 'GitHub Pages');
  assert.equal(find('acme.herokuapp.com'), 'Heroku');
  assert.equal(find('acme.s3.amazonaws.com'), 'Amazon S3');
  assert.equal(find('acme.azurewebsites.net'), 'Azure');
  assert.equal(find('acme.netlify.app'), 'Netlify');
  assert.equal(find('cname.vercel-dns.com'), 'Vercel');
  assert.equal(find('acme.myshopify.com'), 'Shopify');
  assert.equal(find('www.example.com'), undefined);
  assert.equal(find('github.io.attacker.example'), undefined);
  const gh = TAKEOVER_SIGNS.find((s) => s.service === 'GitHub Pages')!;
  assert.ok(gh.body.test("<h1>404</h1><p>There isn't a GitHub Pages site here.</p>"));
  assert.ok(!gh.body.test('<h1>Welcome</h1>'));
});

test('only claimable dangling CNAMEs count as takeovers', () => {
  const base = { host: 'media.example.com', apex: 'example.com', resolves: false, unclaimedPage: false, targetDomainRegistered: true };
  assert.equal(takeoverVerdict({ ...base, target: 'old-origin.example.com' }), null, 'a broken CNAME inside your own domain cannot be claimed by outsiders');
  assert.equal(takeoverVerdict({ ...base, target: 'cdn.someone-else.example' }), null, 'a broken target on someone else’s registered domain cannot be claimed either');
  assert.match(takeoverVerdict({ ...base, target: 'cdn.expired-brand.example', targetDomainRegistered: false })!, /not registered/);
  assert.match(takeoverVerdict({ ...base, target: 'acme.herokuapp.com', service: 'Heroku' })!, /Heroku/);
  assert.match(takeoverVerdict({ ...base, target: 'acme.github.io', service: 'GitHub Pages', resolves: true, unclaimedPage: true })!, /GitHub Pages/);
  assert.equal(takeoverVerdict({ ...base, target: 'acme.github.io', service: 'GitHub Pages', resolves: true, unclaimedPage: false }), null, 'a live GitHub Pages site is fine');
});

test('certificate names are limited to the domain and exclude wildcards', () => {
  assert.deepEqual(namesUnder('example.com', ['example.com\nwww.example.com', '*.example.com', 'API.Example.com.', 'example.com.evil.test', 'notexample.com']).sort(),
    ['api.example.com', 'example.com', 'www.example.com']);
});
