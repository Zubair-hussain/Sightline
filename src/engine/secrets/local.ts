/**
 * Sightline Secrets — local folders and Git history (MIT). Desktop app, CLI and MCP only; the
 * public web version never imports this file.
 *
 * Git history includes secrets that were committed and later deleted: they still exist in every
 * clone, so they count as leaked.
 */
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { dedupe, describeLocation, publicFinding, scanText, type RawFinding, type SecretFinding } from './scan';
import { canVerify, verifySecret } from './verify';

export interface LocalScanOptions {
  /** Ask providers whether found keys are live. Only when the user confirmed they own the code. */
  verify?: boolean;
  maxFiles?: number;
  maxCommits?: number;
  onProgress?: (s: string) => void;
}

export interface LocalScanResult {
  target: string;
  kind: 'folder' | 'git';
  findings: SecretFinding[];
  scanned: { files: number; commits: number; bytes: number };
  verification: 'off' | 'on';
}

const SKIP_DIRS = new Set(['.git', 'node_modules', 'out-test', 'bower_components', 'vendor', 'dist', 'build', 'out', '.next', '.nuxt', 'coverage', '__pycache__', '.venv', 'venv', '.tox', 'target', '.gradle', '.idea']);
const SKIP_EXT = /\.(png|jpe?g|gif|webp|avif|ico|bmp|tiff?|svgz|mp[34]|m4a|mov|avi|webm|wav|ogg|flac|woff2?|ttf|otf|eot|pdf|zip|gz|tgz|bz2|xz|7z|rar|jar|war|exe|dll|so|dylib|bin|class|o|a|lock|min\.map)$/i;
const MAX_FILE = 2 * 1024 * 1024;

async function finish(target: string, kind: LocalScanResult['kind'], raw: RawFinding[], scanned: LocalScanResult['scanned'], opts: LocalScanOptions): Promise<LocalScanResult> {
  const found = dedupe(raw);
  if (opts.verify) {
    opts.onProgress?.('Asking providers whether the keys are live');
    for (const f of found) if (canVerify(f.detector)) f.verified = await verifySecret(f.detector, f.secret);
  }
  return { target, kind, findings: found.map(publicFinding), scanned, verification: opts.verify ? 'on' : 'off' };
}

/** Scans every text file under `dir`, skipping dependencies, build output and binaries. */
export async function scanFolder(dir: string, opts: LocalScanOptions = {}): Promise<LocalScanResult> {
  const root = path.resolve(dir);
  const raw: RawFinding[] = [];
  const scanned = { files: 0, commits: 0, bytes: 0 };
  const max = opts.maxFiles ?? 20000;
  const walk = async (d: string): Promise<void> => {
    if (scanned.files >= max) return;
    for (const e of await fs.readdir(d, { withFileTypes: true }).catch(() => [])) {
      if (scanned.files >= max) return;
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) await walk(p); continue; }
      if (!e.isFile() || SKIP_EXT.test(e.name)) continue;
      const stat = await fs.stat(p).catch(() => null);
      if (!stat || stat.size > MAX_FILE) continue;
      const buf = await fs.readFile(p).catch(() => null);
      if (!buf || buf.subarray(0, 8000).includes(0)) continue;
      scanned.files++; scanned.bytes += buf.length;
      if (scanned.files % 500 === 0) opts.onProgress?.(`Scanned ${scanned.files} files`);
      raw.push(...scanText(buf.toString('utf8'), { source: 'file', file: path.relative(root, p).split(path.sep).join('/'), line: 1 }));
    }
  };
  await walk(root);
  return finish(root, 'folder', raw, scanned, opts);
}

function run(cmd: string, args: string[], onLine?: (line: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let rest = '';
    let err = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      if (!onLine) return;
      const lines = (rest + chunk).split('\n');
      rest = lines.pop() ?? '';
      for (const l of lines) onLine(l);
    });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e: NodeJS.ErrnoException) => reject(e.code === 'ENOENT' ? new Error('Git is not installed or not on PATH. Install Git to scan repositories.') : e));
    child.on('close', (code) => { if (rest && onLine) onLine(rest); code === 0 ? resolve() : reject(new Error(err.trim().split('\n').pop() || `${cmd} exited with ${code}`)); });
  });
}

/** A Git remote rather than a website: git@/ssh:/git: addresses, .git URLs, or owner/repo on a code host. */
export const isGitUrl = (s: string): boolean => !/\s/.test(s) && (/^(git@|ssh:\/\/|git:\/\/)/i.test(s)
  || (/^https?:\/\//i.test(s) && (/\.git\/?$/i.test(s) || /^https?:\/\/(www\.)?(github\.com|gitlab\.com|bitbucket\.org|codeberg\.org)\/[^/\s]+\/[^/\s]+\/?$/i.test(s))));

/**
 * Scans the added lines of every commit on every branch. `target` is a local repository or a
 * Git URL (cloned into a temporary folder that is deleted afterwards).
 */
export async function scanGitHistory(target: string, opts: LocalScanOptions = {}): Promise<LocalScanResult> {
  let repo = target;
  let tmp: string | null = null;
  try {
    if (isGitUrl(target)) {
      tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sightline-secrets-'));
      opts.onProgress?.(`Cloning ${target}`);
      await run('git', ['clone', '--quiet', '--no-checkout', '--no-tags', target, tmp]);
      repo = tmp;
    }
    const raw: RawFinding[] = [];
    const scanned = { files: 0, commits: 0, bytes: 0 };
    let commit = { sha: '', author: '', date: '' };
    let file = '';
    let lineNo = 0;
    let block: string[] = [];
    let blockStart = 0;
    const flush = () => {
      if (block.length && file) raw.push(...scanText(block.join('\n'), { source: 'git', file, line: blockStart, commit: commit.sha, author: commit.author, date: commit.date }));
      block = [];
    };
    const maxCommits = opts.maxCommits ?? 5000;
    await run('git', ['-C', repo, 'log', '--all', '-p', '--no-color', '--no-ext-diff', '-U0', `--max-count=${maxCommits}`, '--format=%x00commit %H%x00%an%x00%aI'], (l) => {
      if (l.startsWith('\0commit ')) {
        flush();
        const [, sha, author, date] = l.split('\0');
        commit = { sha: sha.replace('commit ', ''), author, date };
        scanned.commits++;
        if (scanned.commits % 200 === 0) opts.onProgress?.(`Scanned ${scanned.commits} commits`);
      } else if (l.startsWith('+++ ')) {
        flush();
        file = l === '+++ /dev/null' ? '' : l.slice(4).replace(/^b\//, '');
        if (file) scanned.files++;
      } else if (l.startsWith('@@')) {
        flush();
        lineNo = Number(l.match(/\+(\d+)/)?.[1] ?? 0);
        blockStart = lineNo;
      } else if (l.startsWith('+')) {
        if (!block.length) blockStart = lineNo;
        block.push(l.slice(1));
        scanned.bytes += l.length;
        lineNo++;
      } else if (l.startsWith('-') || l.startsWith('diff ')) {
        flush();
      }
    });
    flush();
    return await finish(target, 'git', raw, scanned, opts);
  } finally {
    if (tmp) await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Picks the right source: a Git URL or a folder with .git → history; any other folder → files. */
export async function scanLocalTarget(target: string, opts: LocalScanOptions = {}): Promise<LocalScanResult> {
  if (isGitUrl(target)) return scanGitHistory(target, opts);
  const hasGit = await fs.stat(path.join(target, '.git')).then(() => true, () => false);
  return hasGit ? scanGitHistory(target, opts) : scanFolder(target, opts);
}

const LIVE: Record<SecretFinding['verified'], string> = { verified: 'CONFIRMED LIVE', invalid: 'no longer works', unverified: 'could not confirm', 'not-checked': '' };

/** Plain-text / Markdown summary used by the CLI and MCP server. Values are masked. */
export function formatSecretsText(r: LocalScanResult): string {
  const lines = [`# Exposed secrets — ${r.target}`, `${r.kind === 'git' ? `${r.scanned.commits} commits` : `${r.scanned.files} files`} scanned · ${(r.scanned.bytes / 1048576).toFixed(1)} MB · verification ${r.verification}`];
  if (!r.findings.length) return [...lines, '', 'No secrets found.'].join('\n');
  lines.push('', `${r.findings.length} secret(s) found. Rotate each one first, then remove it from the code${r.kind === 'git' ? ' and rewrite the history (or treat it as public forever)' : ''}.`);
  for (const f of r.findings) {
    lines.push(`- [${f.severity}] **${f.name}** \`${f.masked}\` — ${describeLocation(f.location)}${f.alsoAt.length ? ` (+${f.alsoAt.length} more)` : ''}${LIVE[f.verified] ? ` — ${LIVE[f.verified]}` : ''}`);
  }
  return lines.join('\n');
}
