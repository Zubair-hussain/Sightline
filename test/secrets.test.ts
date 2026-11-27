import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as cheerio from 'cheerio';
import { DETECTORS } from '../src/engine/secrets/detectors';
import { dedupe, decodedVariants, fingerprint, mask, publicFinding, scanText } from '../src/engine/secrets/scan';
import { isGitUrl, scanFolder, scanGitHistory } from '../src/engine/secrets/local';
import { auditSecrets } from '../src/engine/secrets/website';
import { secretsSection } from '../src/engine/report-html';
import { FAKES, SUPABASE_ANON, fake } from './secrets-fakes';

const at = { source: 'file' as const, file: 'app.ts', line: 1 };
const ids = (text: string) => scanText(text, at).map((f) => f.detector);

test('every detector pattern is global and has keywords', () => {
  for (const d of DETECTORS) {
    assert.ok(d.pattern.global, `${d.id} needs the g flag`);
    assert.ok(d.keywords.length && d.keywords.every((k) => k === k.toLowerCase()), `${d.id} keywords must be lower-case`);
  }
  assert.ok(DETECTORS.length >= 45, `expected about 50 detectors, have ${DETECTORS.length}`);
});

test('each fake credential is found by its own detector', () => {
  for (const [id, secret] of Object.entries(FAKES)) {
    const found = ids(`const value = "${secret}";`);
    assert.ok(found.includes(id), `${id} not found (got ${found.join(', ') || 'nothing'})`);
  }
});

test('placeholders, public keys and look-alikes are not reported', () => {
  const x36 = 'x'.repeat(36);
  assert.deepEqual(ids(`token = "${['gh', 'p_'].join('')}${x36}"`), [], 'repeated characters are a placeholder');
  assert.deepEqual(ids(`url = "postgres://user:your_password@localhost/db"`), [], 'documentation URL');
  assert.deepEqual(ids(`const key = "${SUPABASE_ANON}"`), [], 'the Supabase anon key is meant to be public');
  assert.deepEqual(ids(`password = "${'hunter2'}"`), [], 'too short and low entropy for the generic rule');
  assert.deepEqual(ids('const apiKey = process.env.API_KEY;'), []);
  assert.deepEqual(ids(`const pk = "${['pk', '_live_'].join('')}${fake(24)}"`), [], 'Stripe publishable keys are public');
});

test('a generic high-entropy secret assignment is reported once, specific detectors win', () => {
  const generic = scanText(`client_secret: "${fake(32)}"`, at);
  assert.deepEqual(generic.map((f) => f.detector), ['generic-secret']);
  const specific = scanText(`api_key = "${FAKES['stripe-secret']}"`, at);
  assert.deepEqual(specific.map((f) => f.detector), ['stripe-secret']);
});

test('keys hidden with base64, URL or unicode encoding are found and labelled', () => {
  const key = FAKES['github-token'];
  const b64 = scanText(`const cfg = "${Buffer.from(`token=${key}`).toString('base64')}";`, at);
  assert.equal(b64[0]?.detector, 'github-token');
  assert.equal(b64[0]?.decodedFrom, 'base64');
  const url = scanText(`?t=${encodeURIComponent(`"${FAKES['sendgrid']}"`)}`, at);
  assert.ok(url.some((f) => f.detector === 'sendgrid'));
  const uni = scanText(`"${[...key].map((ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`).join('')}"`, at);
  assert.ok(uni.some((f) => f.detector === 'github-token' && f.decodedFrom === 'unicode'));
  assert.deepEqual(decodedVariants('plain text with nothing encoded'), []);
});

test('line numbers are counted from the start of the scanned text', () => {
  const [f] = scanText(`a\nb\nconst k = "${FAKES['npm-token']}"`, { source: 'file', file: 'x.js', line: 10 });
  assert.equal(f.location.line, 12);
});

test('secrets are masked, fingerprinted and never kept in public findings', () => {
  const key = FAKES['stripe-secret'];
  assert.equal(mask(key), `${key.slice(0, 4)}…${key.slice(-4)}`);
  assert.equal(mask('short12345'), 'sh••••');
  assert.equal(fingerprint(key), fingerprint(key));
  assert.notEqual(fingerprint(key), fingerprint(key + 'x'));
  const raw = [...scanText(`a = "${key}"`, { source: 'file', file: 'a.js' }), ...scanText(`b = "${key}"`, { source: 'file', file: 'b.js' })];
  const [one, ...rest] = dedupe(raw);
  assert.equal(rest.length, 0, 'same secret in two files is one finding');
  assert.equal(one.alsoAt.length, 1);
  const pub = publicFinding(one);
  assert.equal('secret' in pub, false);
  assert.ok(!JSON.stringify(pub).includes(key), 'the raw key must not appear anywhere in a public finding');
});

test('Git URLs are told apart from websites', () => {
  assert.ok(isGitUrl('https://github.com/Zubair-hussain/Sightline'));
  assert.ok(isGitUrl('https://gitlab.com/group/project.git'));
  assert.ok(isGitUrl('git@github.com:owner/repo.git'));
  assert.ok(!isGitUrl('https://sightaud.com'));
  assert.ok(!isGitUrl('https://github.com/features/actions/more'));
  assert.ok(!isGitUrl('./my-project'));
});

test('folder scan finds secrets in source files and skips dependencies and binaries', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sl-secrets-'));
  try {
    await fs.mkdir(path.join(dir, 'src'));
    await fs.mkdir(path.join(dir, 'node_modules', 'lib'), { recursive: true });
    await fs.writeFile(path.join(dir, 'src', 'config.ts'), `export const a = 1;\nexport const key = "${FAKES['openai']}";\n`);
    await fs.writeFile(path.join(dir, 'node_modules', 'lib', 'index.js'), `module.exports = "${FAKES['npm-token']}";`);
    await fs.writeFile(path.join(dir, 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0]));
    const r = await scanFolder(dir);
    assert.deepEqual(r.findings.map((f) => `${f.detector} ${f.location.file}:${f.location.line}`), ['openai src/config.ts:2']);
    assert.equal(r.kind, 'folder');
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('Git history scan finds a secret that was committed and later deleted', async (t) => {
  try { execFileSync('git', ['--version'], { stdio: 'ignore' }); } catch { t.skip('git is not installed'); return; }
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sl-git-'));
  const git = (...a: string[]) => execFileSync('git', ['-C', dir, ...a], { stdio: 'pipe' }).toString().trim();
  try {
    git('init', '-q');
    git('config', 'user.email', 'test@sightline.invalid');
    git('config', 'user.name', 'Sightline Test');
    git('config', 'commit.gpgsign', 'false');
    await fs.writeFile(path.join(dir, 'app.js'), 'const x = 1;\n');
    git('add', '.'); git('commit', '-q', '-m', 'first');
    await fs.writeFile(path.join(dir, 'app.js'), `const x = 1;\nconst token = "${FAKES['github-token']}";\n`);
    git('add', '.'); git('commit', '-q', '-m', 'add token');
    const leaked = git('rev-parse', 'HEAD');
    await fs.writeFile(path.join(dir, 'app.js'), 'const x = 1;\n');
    git('add', '.'); git('commit', '-q', '-m', 'remove token');
    const r = await scanGitHistory(dir);
    assert.equal(r.kind, 'git');
    assert.equal(r.scanned.commits, 3);
    assert.equal(r.findings.length, 1);
    assert.equal(r.findings[0].detector, 'github-token');
    assert.equal(r.findings[0].location.commit, leaked);
    assert.equal(r.findings[0].location.file, 'app.js');
    assert.equal(r.findings[0].location.line, 2);
    assert.equal(r.findings[0].location.author, 'Sightline Test');
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('website audit scans scripts, source maps and leaked files without keeping raw keys', async () => {
  const key = FAKES['anthropic'];
  const map = JSON.stringify({ version: 3, sources: ['src/api.ts'], sourcesContent: [`// original source\nconst k = "${key}";\n`], mappings: '' });
  const routes: Record<string, [string, string]> = {
    '/': ['text/html', '<!doctype html><html><head><script src="/app.js"></script></head><body>Hi</body></html>'],
    '/app.js': ['application/javascript', 'console.log(1);\n//# sourceMappingURL=app.js.map'],
    '/app.js.map': ['application/json', map],
    '/.env': ['text/plain', `DATABASE_URL=${FAKES['database-url']}\nNODE_ENV=production\n`],
  };
  const server = http.createServer((req, res) => {
    const r = routes[req.url ?? ''];
    // Like many single-page apps: unknown paths return the HTML page with 200.
    res.writeHead(200, { 'content-type': r?.[0] ?? 'text/html' });
    res.end(r?.[1] ?? routes['/'][1]);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const html = routes['/'][1];
    const page = { url: `${base}/`, finalUrl: `${base}/`, html, headers: {}, $: cheerio.load(html), res: {} } as never;
    const cat = await auditSecrets(page, {}, () => undefined);
    const byId = Object.fromEntries(cat.checks.map((c) => [c.id, c]));
    assert.equal(byId['secrets.keys'].status, 'fail');
    assert.equal(byId['secrets.exposed-files'].status, 'fail');
    assert.equal(cat.data.exposedFiles.length, 1, 'only /.env is real; the HTML fallback for other paths is ignored');
    assert.equal(byId['secrets.source-maps'].status, 'warn');
    const detectors = cat.data.findings.map((f) => f.detector).sort();
    assert.deepEqual(detectors, ['anthropic', 'database-url']);
    const anthropic = cat.data.findings.find((f) => f.detector === 'anthropic')!;
    assert.equal(anthropic.location.source, 'sourcemap');
    assert.equal(anthropic.location.file, 'src/api.ts');
    assert.equal(anthropic.location.line, 2);
    assert.equal(cat.data.verification, 'off');
    assert.ok(!JSON.stringify(cat).includes(key), 'raw keys must not appear in the category');
    const html2 = secretsSection(cat.data);
    assert.match(html2, /Not tested/);
    assert.ok(!html2.includes(key));
  } finally { server.close(); }
});

test('private keys: real PEM layouts are found, source code that mentions the markers is not', async () => {
  const body = fake(64, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/', 101);
  const begin = ['-----BEGIN', ' RSA PRIVATE KEY-----'].join('');
  const end = ['-----END', ' RSA PRIVATE KEY-----'].join('');
  const pem = `${begin}\n${body}\n${body}\n${end}`;
  const encrypted = `${begin}\nProc-Type: 4,ENCRYPTED\nDEK-Info: AES-128-CBC,${fake(32, '0123456789ABCDEF', 7)}\n\n${body}\n${end}`;
  const inJson = JSON.stringify({ type: 'other', private_key: pem });
  for (const [label, text] of [['plain PEM', pem], ['encrypted PEM with headers', encrypted], ['JSON-escaped', inJson]] as const) {
    const found = scanText(text, at).filter((f) => f.detector === 'private-key');
    assert.equal(found.length, 1, label);
    assert.equal(found[0].masked, `${begin} …`, `${label}: masked to the header only`);
  }
  const detectorSource = await fs.readFile(path.join(__dirname, '../../src/engine/secrets/detectors.ts'), 'utf8');
  assert.deepEqual(scanText(detectorSource, at).map((f) => f.detector), [], 'the scanner must not flag its own patterns');
});

test('the private-key pattern stays fast on input crafted to make it backtrack (CodeQL js/redos)', () => {
  const begin = ['-----BEGIN', ' PRIVATE KEY-----'].join('');
  for (const attack of [`${begin}\n${'-: \n'.repeat(20000)}`, `${begin}\n${'a: x\n'.repeat(20000)}`, `${begin}\n${'A: \n'.repeat(20000)}`]) {
    const started = process.hrtime.bigint();
    scanText(attack, at);
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    assert.ok(ms < 1500, `took ${ms.toFixed(0)} ms`);
  }
});
