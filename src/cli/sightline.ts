#!/usr/bin/env node
import * as fs from 'node:fs/promises';
import { runAudit, VERSION, BROWSER_MODULES } from '../engine';
import { renderHtmlReport, CATEGORY_NAMES } from '../engine/report-html';
import { testCasesToCsv, testCasesToMarkdown, testCasesToPlaywright } from '../engine/testcases';
import { formatSecretsText, isGitUrl, scanLocalTarget, type LocalScanResult } from '../engine/secrets/local';
import { describeLocation, type SecretFinding } from '../engine/secrets/scan';

const HELP = `
Sightline ${VERSION} — website audit from the command line

Usage
  sightline <url> [options]
  sightline secrets <url | folder | repository | git-url> [secrets options]

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

Secrets options
  --json <file>        Write the findings as JSON (values are masked)
  --fail-on-found      Exit with code 1 when any secret is found (for CI)
  --verify             Ask each provider whether found keys still work (read-only).
                       Only for your own site or code: requires --i-own-this
  --only-verified      With --verify, report only keys confirmed live
  --no-history         For a local repository, scan the current files instead of every commit

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
    else if (['--quiet', '--verify', '--i-own-this', '--fail-on-found', '--only-verified', '--no-history'].includes(a)) args[a.slice(2)] = true;
    else if (a.startsWith('--')) args[a.slice(2)] = argv[++i] ?? '';
    else positional.push(a);
  }
  return { args, positional };
}

async function main(): Promise<void> {
  const { args, positional } = parseArgs(process.argv.slice(2));
  if (args.help || !positional[0]) { console.log(HELP); process.exit(args.help ? 0 : 1); }
  if (positional[0] === 'secrets') return runSecrets(positional[1], args);
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

const SEV = { critical: c.red, high: c.red, medium: c.yellow, low: c.dim } as const;

/** sightline secrets <target>: a website, folder, local repository (history) or Git URL. */
async function runSecrets(target: string | undefined, args: Record<string, string | boolean>): Promise<void> {
  if (!target) { console.log(HELP); process.exit(1); }
  const verify = args.verify === true;
  if (verify && args['i-own-this'] !== true) throw new Error('--verify contacts each provider with the found key. Add --i-own-this to confirm the site or code is yours.');
  const progress = (s: string) => { if (process.stderr.isTTY) process.stderr.write(`\r\x1b[K  ${c.dim(s)}`.slice(0, (process.stderr.columns || 100) - 1)); };

  let result: LocalScanResult;
  if (/^https?:\/\//i.test(target) && !isGitUrl(target) || /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(target) && !(await fs.stat(target).then(() => true, () => false))) {
    const report = await runAudit({ url: target, modules: ['secrets'], verifySecrets: verify }, null, (p) => progress(p.step));
    const cat = report.categories.secrets as SL.Category<{ findings: SecretFinding[]; scanned: { pages: number; scripts: number; sourceMaps: number; bytes: number }; verification: 'on' | 'off'; exposedFiles: string[] }> | undefined;
    if (!cat || cat.error) throw new Error(cat?.error ?? 'The secrets scan did not run.');
    result = { target: report.finalUrl, kind: 'folder', findings: cat.data.findings, scanned: { files: cat.data.scanned.scripts + cat.data.scanned.sourceMaps + 1, commits: 0, bytes: cat.data.scanned.bytes }, verification: cat.data.verification };
    for (const f of cat.data.exposedFiles) console.error(`  ${c.red('✗')} Publicly downloadable: ${f}`);
  } else {
    const opts = { verify, onProgress: progress };
    result = args['no-history'] === true ? await (await import('../engine/secrets/local')).scanFolder(target, opts) : await scanLocalTarget(target, opts);
  }
  if (process.stderr.isTTY) process.stderr.write('\r\x1b[K');

  if (args['only-verified'] === true) result = { ...result, findings: result.findings.filter((f) => f.verified === 'verified') };
  if (typeof args.json === 'string') await fs.writeFile(args.json, JSON.stringify(result, null, 2));
  if (!args.quiet) {
    console.log(`
  ${c.bold('Sightline secrets')} ${c.dim(VERSION)}  ${c.blue(result.target)}`);
    console.log(`  ${c.dim(`${result.kind === 'git' ? `${result.scanned.commits} commits` : `${result.scanned.files} files`} · ${(result.scanned.bytes / 1048576).toFixed(1)} MB · verification ${result.verification}`)}
`);
    for (const f of result.findings) {
      const live = f.verified === 'verified' ? c.red(' CONFIRMED LIVE') : f.verified === 'invalid' ? c.dim(' (no longer works)') : '';
      console.log(`  ${SEV[f.severity](f.severity.toUpperCase().padEnd(8))} ${f.name}  ${c.bold(f.masked)}${live}`);
      console.log(`           ${c.dim(describeLocation(f.location) + (f.alsoAt.length ? ` (+${f.alsoAt.length} more)` : ''))}`);
    }
    console.log(result.findings.length ? `
  ${c.red(`${result.findings.length} secret(s) found.`)} Rotate each one, then remove it from the code.
` : `  ${c.green('No secrets found.')}
`);
  } else console.log(formatSecretsText(result));
  if (args['fail-on-found'] === true && result.findings.length) process.exit(1);
}

main().catch((err: Error) => { console.error(c.red(`\n  Error: ${err.message}\n`)); process.exit(2); });
