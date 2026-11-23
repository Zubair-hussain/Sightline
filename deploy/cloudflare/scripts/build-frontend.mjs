import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(project, '../..');
const web = path.join(root, 'web');
const output = path.join(project, 'public');
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
if (!siteUrl || !/^https:\/\//.test(siteUrl)) throw new Error('Set NEXT_PUBLIC_SITE_URL to your public Cloudflare HTTPS URL before building.');

// Reuse the existing Next build, including its pre-rendered homepage and client hydration.
// No audit engine or API server is uploaded to Cloudflare.
// Invoke npm through its JS entry point when available (also works with Windows paths).
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run this script through npm run build.');
const result = spawnSync(process.execPath, [npmCli, '--prefix', web, 'run', 'build'], {
  cwd: root, stdio: 'inherit',
  env: { ...process.env, SIGHTLINE_EDGE_BUILD: '1', SIGHTLINE_API_ONLY: '0', NEXT_TELEMETRY_DISABLED: '1' },
});
if (result.status !== 0) process.exit(result.status || 1);

const html = await readFile(path.join(web, '.next/server/app/index.html'), 'utf8');
if (!html.includes('Every detail') || html.includes('/_next/image?')) throw new Error('Unexpected frontend build output.');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(path.join(web, 'public'), output, { recursive: true });
await cp(path.join(web, '.next/static'), path.join(output, '_next/static'), { recursive: true });
await writeFile(path.join(output, 'index.html'), html);
await cp(path.join(web, '.next/server/app/_not-found.html'), path.join(output, '404.html'));
for (const file of ['robots.txt', 'sitemap.xml']) {
  await cp(path.join(web, '.next/server/app', `${file}.body`), path.join(output, file));
}
console.log(`Cloudflare frontend packaged at ${output}`);
