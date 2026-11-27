#!/usr/bin/env node
import * as fs from 'node:fs/promises';
import { runAudit, VERSION, BROWSER_MODULES } from '../engine';
import { renderHtmlReport, CATEGORY_NAMES } from '../engine/report-html';
import { testCasesToCsv, testCasesToMarkdown, testCasesToPlaywright } from '../engine/testcases';

const HELP = `
Sightline ${VERSION} — website audit from the command line

Usage
  sightline <url> [options]

Options
  --modules <list>     Comma list: seo,hreflang,links,website,cloudflare,security  (default: all)
  --pages <n>          Pages to crawl for site-wide SEO checks (default 15)
  --links <n>          Maximum links to status-check (default 150)
  --json <file>        Write the full report as JSON
  --html <file>        Write a standalone HTML report (styled like the audited site)
  --test-cases <file>  Write the launch-day test plan: .csv (Excel), .md, or .spec.ts (Playwright)
  --fail-under <n>     Exit with code 1 when the overall score is below n (for CI)
  --quiet              Only print the final score
  -h, --help           Show this help

Environment
  CLOUDFLARE_API_TOKEN Read-only API token to review Cloudflare zone settings

Performance, Lighthouse, code coverage, iPhone/iPad and memory-leak audits need a browser
engine and run in the desktop app (or via its MCP server).
`;

const c = {
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
};
const ICON: Record<SL.Status, string> = { pass: c.green('✓'), warn: c.yellow('!'), fail: c.red('✗'), info: c.dim('i') };
const color = (n: number | null) => (n == null ? c.dim('—') : n >= 90 ? c.green(String(n)) : n >= 50 ? c.yellow(String(n)) : c.red(String(n)));

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') args.help = true;
    else if (a === '--quiet') args.quiet = true;
    else if (a.startsWith('--')) args[a.slice(2)] = argv[++i] ?? '';
    else positional.push(a);
  }
  return { args, positional };
}

async function main(): Promise<void> {
  const { args, positional } = parseArgs(process.argv.slice(2));
  if (args.help || !positional[0]) { console.log(HELP); process.exit(args.help ? 0 : 1); }
  const quiet = Boolean(args.quiet);
  const modules = (typeof args.modules === 'string' ? args.modules.split(',') : ['seo', 'hreflang', 'links', 'website', 'cloudflare', 'security'])
    .map((m) => m.trim()).filter((m) => !BROWSER_MODULES.includes(m as SL.CategoryKey)) as SL.CategoryKey[];

  let last = '';
  const report = await runAudit(
    {
      url: positional[0],
      modules,
      maxPages: args.pages ? Number(args.pages) : undefined,
      maxLinks: args.links ? Number(args.links) : undefined,
      cloudflareToken: process.env.CLOUDFLARE_API_TOKEN,
    },
    null,
    (p) => {
      if (quiet || !process.stderr.isTTY) return;
      const line = `  ${c.dim(`${String(p.pct).padStart(3)}%`)} ${p.step}`.slice(0, (process.stderr.columns || 100) - 1);
      if (line !== last) { process.stderr.write(`\r\x1b[K${line}`); last = line; }
    },
  );
  if (!quiet && process.stderr.isTTY) process.stderr.write('\r\x1b[K');

  if (!quiet) {
    console.log(`\n  ${c.bold('Sightline')} ${c.dim(VERSION)}  ${c.blue(report.finalUrl)}`);
    console.log(`  ${c.dim(`${(report.durationMs / 1000).toFixed(1)} s · HTTP ${report.meta.status}`)}\n`);
    for (const cat of Object.values(report.categories)) {
      if (!cat) continue;
      console.log(`  ${c.bold(CATEGORY_NAMES[cat.key].padEnd(20))} ${color(cat.score)}   ${c.dim(`${cat.summary.pass} pass · ${cat.summary.warn} warn · ${cat.summary.fail} fail`)}`);
      for (const ch of cat.checks.filter((x) => x.status === 'fail' || x.status === 'warn')) {
        console.log(`    ${ICON[ch.status]} ${ch.title} ${c.dim('— ' + ch.detail)}`);
      }
      console.log('');
    }
  }
  console.log(`  ${c.bold('Overall score')}  ${color(report.score)}\n`);

  if (typeof args.json === 'string') await fs.writeFile(args.json, JSON.stringify(report, null, 2));
  if (typeof args.html === 'string') await fs.writeFile(args.html, renderHtmlReport(report));
  if (typeof args['test-cases'] === 'string') {
    const f = args['test-cases'];
    const cases = report.testCases ?? [];
    await fs.writeFile(f, f.endsWith('.csv') ? testCasesToCsv(cases) : f.endsWith('.ts') ? testCasesToPlaywright(report) : testCasesToMarkdown(cases, report));
  }
  if (args['fail-under'] && (report.score ?? 0) < Number(args['fail-under'])) process.exit(1);
}

main().catch((err: Error) => { console.error(c.red(`\n  Error: ${err.message}\n`)); process.exit(2); });
