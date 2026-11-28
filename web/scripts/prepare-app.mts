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

// Google Analytics 4 for the web app only (the desktop app has no analytics). The page keeps a strict
// CSP, so the tag is an external same-origin file and only Google Analytics' own hosts are allowed.
const GA4_ID = 'G-ZYH5HM0HG6';
const GA_HOSTS = 'https://www.googletagmanager.com https://*.google-analytics.com https://*.analytics.google.com';
const CONSENT_REGIONS = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'GB', 'CH'];
const analytics = `// Google Consent Mode defaults (denied in the EEA, UK and Switzerland until consent), then GA4.
window.dataLayer = window.dataLayer || [];
function gtag() { dataLayer.push(arguments); }
gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied', wait_for_update: 500, region: ${JSON.stringify(CONSENT_REGIONS)} });
gtag('consent', 'default', { ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted', analytics_storage: 'granted' });
gtag('js', new Date());
gtag('config', '${GA4_ID}');
`;

const html = (await fs.readFile(path.join(renderer, 'index.html'), 'utf8'))
  .replace('<head>', `<head>\n  <base href="/app/">\n  <script src="analytics.js"></script>\n  <script async src="https://www.googletagmanager.com/gtag/js?id=${GA4_ID}"></script>`)
  .replace('<title>Sightline</title>', appMeta)
  .replace("script-src 'self'", `script-src 'self' https://www.googletagmanager.com`)
  .replace("connect-src 'none'", `connect-src 'self' ${GA_HOSTS}`)
  .replace("img-src 'self' data:", `img-src 'self' data: blob: ${GA_HOSTS}`)
  .replace('<script type="module" src="dist/app.js"></script>',
    '<script type="module" src="dist/web-bridge.js"></script>\n  <script type="module" src="dist/app.js"></script>');
if (!html.includes('web-bridge.js')) throw new Error('renderer/index.html changed: could not inject the web bridge');
if (!html.includes('rel="canonical"')) throw new Error('renderer/index.html changed: could not inject the /app title and canonical');
if (!html.includes(`connect-src 'self' ${GA_HOSTS}`) || !html.includes("script-src 'self' https://www.googletagmanager.com")) throw new Error('renderer/index.html changed: could not allow Google Analytics in the CSP');
await fs.writeFile(path.join(out, 'index.html'), html);
await fs.writeFile(path.join(out, 'analytics.js'), analytics);
// The web app's What's new tab reads the changelog shipped next to it.
await fs.copyFile(path.join(root, 'CHANGELOG.md'), path.join(out, 'changelog.md'));

await fs.copyFile(path.join(renderer, 'styles.css'), path.join(out, 'styles.css'));
for (const f of await fs.readdir(path.join(renderer, 'dist'))) {
  if (f.endsWith('.js') && f !== 'site.js') await fs.copyFile(path.join(renderer, 'dist', f), path.join(out, 'dist', f));
}
await fs.cp(path.join(renderer, 'assets'), path.join(out, 'assets'), { recursive: true });
await fs.copyFile(path.join(root, 'llms.txt'), path.join(here, '..', 'public', 'llms.txt'));

console.log('Prepared public/app from renderer/');
