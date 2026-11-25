/**
 * Copies the Sightline UI (shared with the desktop app) into public/app so the website can serve it
 * at /app, swapping the desktop bridge for the web bridge. Run after compiling renderer/ (see package.json).
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const renderer = path.join(root, 'renderer');
const out = path.join(here, '..', 'public', 'app');
// Same default as lib/content.ts, so the /app page's canonical URL matches the rest of the site.
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://sightaud.com').replace(/\/$/, '');
const appMeta = [
  '<title>Free website audit online — Sightline</title>',
  '<meta name="description" content="Run a free website audit in your browser: SEO, Lighthouse-style scores, broken links, hreflang, security headers and Cloudflare, each with a plain-language fix.">',
  `<link rel="canonical" href="${siteUrl}/app">`,
].join('\n  ');

await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(path.join(out, 'dist'), { recursive: true });

const html = (await fs.readFile(path.join(renderer, 'index.html'), 'utf8'))
  .replace('<head>', '<head>\n  <base href="/app/">')
  .replace('<title>Sightline</title>', appMeta)
  .replace("connect-src 'none'", "connect-src 'self'")
  .replace("img-src 'self' data:", "img-src 'self' data: blob:")
  .replace('<script type="module" src="dist/app.js"></script>',
    '<script type="module" src="dist/web-bridge.js"></script>\n  <script type="module" src="dist/app.js"></script>');
if (!html.includes('web-bridge.js')) throw new Error('renderer/index.html changed: could not inject the web bridge');
if (!html.includes('rel="canonical"')) throw new Error('renderer/index.html changed: could not inject the /app title and canonical');
await fs.writeFile(path.join(out, 'index.html'), html);

await fs.copyFile(path.join(renderer, 'styles.css'), path.join(out, 'styles.css'));
for (const f of await fs.readdir(path.join(renderer, 'dist'))) {
  if (f.endsWith('.js') && f !== 'site.js') await fs.copyFile(path.join(renderer, 'dist', f), path.join(out, 'dist', f));
}
await fs.cp(path.join(renderer, 'assets'), path.join(out, 'assets'), { recursive: true });
await fs.copyFile(path.join(root, 'llms.txt'), path.join(here, '..', 'public', 'llms.txt'));

console.log('Prepared public/app from renderer/');
