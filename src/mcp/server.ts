/**
 * Minimal Model Context Protocol server over stdio (newline-delimited JSON-RPC 2.0).
 * Lets AI apps such as Cursor and VS Code run Sightline audits.
 */
import * as readline from 'node:readline';
import * as fs from 'node:fs';
import { runAudit, VERSION, ALL_MODULES, BROWSER_MODULES } from '../engine';
import { CATEGORY_NAMES } from '../engine/report-html';
import { testCasesToCsv, testCasesToMarkdown, testCasesToPlaywright } from '../engine/testcases';
import { formatSecretsText, isGitUrl, scanLocalTarget } from '../engine/secrets/local';

type Json = Record<string, unknown>;
interface RpcRequest { jsonrpc: '2.0'; id?: string | number | null; method: string; params?: Json }

const ICON: Record<SL.Status, string> = { pass: '✓', warn: '⚠', fail: '✗', info: 'ℹ' };

export function reportToMarkdown(r: SL.Report, opts: { includePasses?: boolean } = {}): string {
  const lines: string[] = [];
  lines.push(`# Sightline audit — ${r.finalUrl}`);
  lines.push(`Overall score: **${r.score ?? 'n/a'}/100** · ${(r.durationMs / 1000).toFixed(1)} s · HTTP ${r.meta.status}${r.meta.title ? ` · "${r.meta.title}"` : ''}`);
  for (const c of Object.values(r.categories)) {
    if (!c) continue;
    lines.push('', `## ${CATEGORY_NAMES[c.key]} — ${c.score ?? 'n/a'}/100 (${c.summary.fail} failed, ${c.summary.warn} warnings, ${c.summary.pass} passed)`);
    if (c.error) lines.push(`Module could not run: ${c.error}`);
    const shown = c.checks.filter((x) => opts.includePasses || x.status === 'fail' || x.status === 'warn');
    for (const ch of shown) {
      lines.push(`- ${ICON[ch.status]} **${ch.title}** — ${ch.detail}`);
      if (ch.fix && ch.status !== 'pass') lines.push(`  - Fix: ${ch.fix}`);
      for (const item of ch.items.slice(0, 8)) lines.push(`  - \`${item}\``);
      if (ch.items.length > 8) lines.push(`  - …and ${ch.items.length - 8} more`);
    }
    if (!shown.length) lines.push('No issues found.');
  }
  return lines.join('\n');
}

const PERMISSION_PROP = { type: 'boolean', description: 'Required for the memory test: true only after the user confirmed they own the site or have permission to test it.' };
const urlProp = { type: 'string', description: 'Website URL or domain, e.g. "example.com" or "https://example.com/page"' };

function toolDefs(browser: boolean) {
  const modules = browser ? ALL_MODULES : ALL_MODULES.filter((m) => !BROWSER_MODULES.includes(m));
  const tools: Json[] = [
    {
      name: 'audit_website',
      title: 'Full website audit',
      description: `Run a Sightline audit and return a scored report of problems with fixes. Modules: ${modules.join(', ')}.${browser ? '' : ' (performance, mobile and memory need the Sightline desktop app.)'}`,
      inputSchema: {
        type: 'object',
        properties: {
          url: urlProp,
          modules: { type: 'array', items: { type: 'string', enum: modules }, description: 'Which audits to run (default: all available)' },
          max_pages: { type: 'integer', minimum: 1, maximum: 200, description: 'Pages to crawl for site-wide SEO checks (default 10)' },
          max_links: { type: 'integer', minimum: 10, maximum: 1000, description: 'Links to status-check (default 100)' },
          include_passes: { type: 'boolean', description: 'Also list passed checks (default false)' },
          ...(browser ? { i_have_permission: PERMISSION_PROP } : {}),
        },
        required: ['url'],
      },
    },
    {
      name: 'generate_test_cases',
      title: 'Launch-day test plan',
      description: 'Audit a site and generate a launch-day test plan (automated cases pre-filled with pass/fail evidence, plus manual cases). Formats: markdown, csv (Excel/Sheets) or playwright (a runnable TypeScript test file).',
      inputSchema: { type: 'object', properties: { url: urlProp, format: { type: 'string', enum: ['markdown', 'csv', 'playwright'], description: 'default markdown' } }, required: ['url'] },
    },
    { name: 'check_seo', title: 'SEO audit', description: 'Check titles, descriptions, headings, canonical, indexability, robots.txt, sitemap, structured data and duplicate content.', inputSchema: { type: 'object', properties: { url: urlProp }, required: ['url'] } },
    { name: 'check_hreflang', title: 'Hreflang audit', description: 'Validate hreflang codes, self-references, x-default and return tags between language versions.', inputSchema: { type: 'object', properties: { url: urlProp }, required: ['url'] } },
    { name: 'check_links', title: 'Broken link check', description: 'Status-check every <a href> on the page: broken links, redirects, empty and unsafe links.', inputSchema: { type: 'object', properties: { url: urlProp, max_links: { type: 'integer', minimum: 10, maximum: 1000 } }, required: ['url'] } },
    { name: 'check_cloudflare', title: 'Cloudflare & DNS audit', description: 'Check Cloudflare proxying, caching, TLS, HSTS, HTTP/3, origin IP exposure, DNSSEC, CAA and email records.', inputSchema: { type: 'object', properties: { url: urlProp }, required: ['url'] } },
    { name: 'check_cloudflare_security', title: 'Cloudflare security audit', description: 'Check what attackers can see from outside: Content-Security-Policy and other protection headers, security.txt, SPF/DMARC/MTA-STS spoofing protection, subdomain takeover (dangling CNAMEs) and origin servers revealed by certificate-transparency logs. With a Cloudflare API token configured in the app: WAF managed rules, rate limiting, Bot Fight Mode and leaked-credential detection. Read-only: DNS lookups and ordinary GET requests.', inputSchema: { type: 'object', properties: { url: urlProp }, required: ['url'] } },
    { name: 'check_secrets', title: 'Exposed secrets scan', description: 'Find leaked API keys, tokens, passwords and private keys (about 50 kinds). target can be a website (scans the page, its scripts, public source maps and commonly leaked files such as /.env and /.git/config), a local folder, a local Git repository (every commit on every branch, so deleted secrets are found too) or a Git URL (cloned to a temporary folder). Secrets are returned masked. verify: true asks each provider with one read-only request whether a key still works; only do that after the user confirms they own the site or code, and pass i_have_permission: true.', inputSchema: { type: 'object', properties: { target: { type: 'string', description: 'Website URL, folder path, local repository path or Git URL' }, verify: { type: 'boolean', description: 'Check with each provider whether found keys are live (read-only). Requires i_have_permission.' }, i_have_permission: { type: 'boolean', description: 'true only after the user confirmed they own the site or code' } }, required: ['target'] } },
    { name: 'check_security', title: 'Website security & health', description: 'Check HTTPS, certificate, security headers, cookies, compression, caching and accessibility basics.', inputSchema: { type: 'object', properties: { url: urlProp }, required: ['url'] } },
  ];
  if (browser) {
    tools.push(
      { name: 'check_performance', title: 'Core Web Vitals', description: 'Load the page in Chromium and measure LCP, FCP, CLS, TBT, page weight and console errors.', inputSchema: { type: 'object', properties: { url: urlProp }, required: ['url'] } },
      { name: 'check_mobile_ios', title: 'iPhone & iPad audit', description: 'Emulate iPhone or iPad Safari and check viewport, tap targets, input zoom, safe areas, touch icon and Universal Links.', inputSchema: { type: 'object', properties: { url: urlProp, device: { type: 'string', enum: ['iphone', 'ipad'] } }, required: ['url'] } },
      { name: 'check_memory_leaks', title: 'Memory leak test', description: 'INTERACTS WITH THE SITE: scrolls, resizes, opens/closes menus and visits internal pages in a private browser (never submits forms, buys, deletes or follows external links). Ask the user to confirm they own or may test the site, then pass i_have_permission: true.', inputSchema: { type: 'object', properties: { url: urlProp, cycles: { type: 'integer', minimum: 3, maximum: 30 }, i_have_permission: PERMISSION_PROP }, required: ['url', 'i_have_permission'] } },
      { name: 'check_lighthouse', title: 'Lighthouse-style scores', description: 'Throttled page load scored like Lighthouse: Performance (FCP, LCP, TBT, CLS, Speed Index), Accessibility (axe-core), Best Practices and SEO.', inputSchema: { type: 'object', properties: { url: urlProp, form_factor: { type: 'string', enum: ['mobile', 'desktop'] } }, required: ['url'] } },
      { name: 'check_coverage', title: 'Code coverage', description: 'Measure unused JavaScript and CSS bytes per file, like the Chrome DevTools Coverage tab.', inputSchema: { type: 'object', properties: { url: urlProp }, required: ['url'] } },
    );
  }
  return tools;
}

const SINGLE: Record<string, SL.CategoryKey> = {
  check_seo: 'seo', check_hreflang: 'hreflang', check_links: 'links', check_cloudflare: 'cloudflare',
  check_security: 'website', check_performance: 'performance', check_mobile_ios: 'mobile', check_memory_leaks: 'memory',
  check_lighthouse: 'lighthouse', check_coverage: 'coverage', check_cloudflare_security: 'security',
};

export function startMcpServer(browser: SL.BrowserRunner | null, onClose: () => void = () => process.exit(0)): void {
  // Electron's main process (notably on Windows) doesn't wire process.stdin/stdout to pipes,
  // so read and write the raw file descriptors there.
  const inElectron = Boolean(process.versions.electron);
  const input = inElectron ? fs.createReadStream('', { fd: 0 }) : process.stdin;
  const send = (msg: Json) => {
    const line = JSON.stringify(msg) + '\n';
    if (inElectron) fs.writeSync(1, line); else process.stdout.write(line);
  };
  const log = (s: string) => process.stderr.write(`[sightline-mcp] ${s}\n`);
  const reply = (id: RpcRequest['id'], result: unknown) => send({ jsonrpc: '2.0', id: id ?? null, result });
  const fail = (id: RpcRequest['id'], code: number, message: string) => send({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

  async function callTool(name: string, args: Json) {
    if (name === 'check_secrets') {
      const target = String(args.target ?? args.url ?? '').trim();
      if (!target) throw new Error('Pass target: a website URL, folder, repository path or Git URL.');
      const verify = args.verify === true;
      if (verify && args.i_have_permission !== true) throw new Error('Verifying keys contacts each provider with the found key. Ask the user to confirm they own the site or code, then call again with i_have_permission: true.');
      if (/^https?:\/\//i.test(target) && !isGitUrl(target)) {
        const report = await runAudit({ url: target, modules: ['secrets'], verifySecrets: verify }, null, (p) => log(`${p.pct}% ${p.step}`));
        return { content: [{ type: 'text', text: reportToMarkdown(report) }] };
      }
      const result = await scanLocalTarget(target, { verify, onProgress: log });
      return { content: [{ type: 'text', text: formatSecretsText(result) }] };
    }
    const url = String(args.url ?? '');
    if (!url) throw new Error('"url" is required');
    let modules: SL.CategoryKey[];
    if (name === 'audit_website' || name === 'generate_test_cases') {
      modules = Array.isArray(args.modules) && args.modules.length ? (args.modules as SL.CategoryKey[]) : ALL_MODULES;
    } else if (SINGLE[name]) {
      modules = [SINGLE[name]];
    } else {
      throw new Error(`Unknown tool: ${name}`);
    }
    // The memory test interacts with the site: only with explicit permission.
    const permitted = args.i_have_permission === true;
    if (name === 'check_memory_leaks' && !permitted) {
      throw new Error('The memory test interacts with the website. Ask the user to confirm they own it or have permission, then call again with i_have_permission: true.');
    }
    if (!permitted) modules = modules.filter((m) => m !== 'memory');
    const report = await runAudit({
      url,
      modules,
      maxPages: typeof args.max_pages === 'number' ? args.max_pages : 10,
      maxLinks: typeof args.max_links === 'number' ? args.max_links : 100,
      memoryIterations: typeof args.cycles === 'number' ? args.cycles : 8,
      device: args.device === 'ipad' ? 'ipad' : 'iphone',
      lighthouseFormFactor: args.form_factor === 'desktop' ? 'desktop' : 'mobile',
      cloudflareToken: process.env.CLOUDFLARE_API_TOKEN,
    }, browser, (p) => log(`${p.pct}% ${p.step}`));
    if (name === 'generate_test_cases') {
      const cases = report.testCases ?? [];
      const fmt = String(args.format ?? 'markdown');
      const text = fmt === 'csv' ? testCasesToCsv(cases).replace(/^﻿/, '') : fmt === 'playwright' ? testCasesToPlaywright(report) : testCasesToMarkdown(cases, report);
      return { content: [{ type: 'text', text }] };
    }
    const skipped = modules.filter((m) => !report.categories[m]);
    let text = reportToMarkdown(report, { includePasses: Boolean(args.include_passes) });
    if (skipped.length) text += `\n\nNot run here (needs the Sightline desktop app): ${skipped.join(', ')}.`;
    if (browser && !permitted && name === 'audit_website') {
      text += '\n\nMemory test skipped: it interacts with the site. Ask the user for permission, then call again with i_have_permission: true to include it.';
    }
    return { content: [{ type: 'text', text }] };
  }

  const rl = readline.createInterface({ input });
  rl.on('line', async (line) => {
    if (!line.trim()) return;
    let msg: RpcRequest;
    try { msg = JSON.parse(line); } catch { fail(null, -32700, 'Parse error'); return; }
    const isNotification = msg.id === undefined;
    try {
      switch (msg.method) {
        case 'initialize':
          reply(msg.id, {
            protocolVersion: (msg.params?.protocolVersion as string) || '2025-06-18',
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: 'sightline', title: 'Sightline website audit', version: VERSION },
            instructions: 'Use audit_website for a full report, or the check_* tools for a single area. Pass a domain or URL.',
          });
          break;
        case 'notifications/initialized':
        case 'notifications/cancelled':
          break;
        case 'ping':
          reply(msg.id, {});
          break;
        case 'tools/list':
          reply(msg.id, { tools: toolDefs(Boolean(browser)) });
          break;
        case 'tools/call': {
          const name = String(msg.params?.name ?? '');
          try {
            reply(msg.id, await callTool(name, (msg.params?.arguments as Json) ?? {}));
          } catch (err) {
            reply(msg.id, { content: [{ type: 'text', text: `Sightline error: ${(err as Error).message}` }], isError: true });
          }
          break;
        }
        default:
          if (!isNotification) fail(msg.id, -32601, `Method not found: ${msg.method}`);
      }
    } catch (err) {
      if (!isNotification) fail(msg.id, -32603, (err as Error).message);
    }
  });
  rl.on('close', onClose);
  log(`ready (browser audits ${browser ? 'enabled' : 'disabled'})`);
}
