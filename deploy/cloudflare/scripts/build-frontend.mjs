import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(project, '../..');
const web = path.join(root, 'web');
const output = path.join(project, 'public');
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://sightaud.com';
if (!siteUrl || !/^https:\/\//.test(siteUrl)) throw new Error('Set NEXT_PUBLIC_SITE_URL to your public Cloudflare HTTPS URL before building.');

// Reuse the existing Next build, including its pre-rendered homepage and client hydration.
// No audit engine or API server is uploaded to Cloudflare.
// Invoke npm through its JS entry point when available (also works with Windows paths).
// Next caches fetch() results (Blogger posts for 10 minutes) between builds. A deploy must publish
// what Blogger has now, so start every build without that cache.
await rm(path.join(web, '.next/cache/fetch-cache'), { recursive: true, force: true });
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run this script through npm run build.');
const result = spawnSync(process.execPath, [npmCli, '--prefix', web, 'run', 'build'], {
  cwd: root, stdio: 'inherit',
  env: { ...process.env, NEXT_PUBLIC_SITE_URL: siteUrl, SIGHTLINE_EDGE_BUILD: '1', SIGHTLINE_API_ONLY: '0', NEXT_TELEMETRY_DISABLED: '1' },
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
// Other pre-rendered pages: Cloudflare serves /terms from terms.html.
for (const pageFile of ['terms.html']) await cp(path.join(web, '.next/server/app', pageFile), path.join(output, pageFile));
// Blog: the index and every post pre-rendered from the Blogger API at build time.
// Cloudflare serves /blogs from blogs.html and /blogs/2026/11/post from blogs/2026/11/post.html.
const appDir = path.join(web, '.next/server/app');
await cp(path.join(appDir, 'blogs.html'), path.join(output, 'blogs.html'));
let posts = 0;
for (const entry of await readdir(path.join(appDir, 'blogs'), { recursive: true }).catch(() => [])) {
  if (!/^\d{4}[\\/]\d{2}[\\/][^\\/]+\.html$/.test(entry)) continue;
  await mkdir(path.dirname(path.join(output, 'blogs', entry)), { recursive: true });
  await cp(path.join(appDir, 'blogs', entry), path.join(output, 'blogs', entry));
  posts++;
}
console.log(`Blog: ${posts} post page(s)${process.env.BLOGGER_API_KEY ? '' : ' (BLOGGER_API_KEY not set, so the blog shows its empty state)'}`);
console.log(`Cloudflare frontend packaged at ${output}`);
