/* Renders the social preview / share image (1280×640). Run: npm run thumbnail */
import { app, BrowserWindow } from 'electron';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const ROOT = path.join(__dirname, '..', '..');
const W = 1280;
const H = 640;

function ring(score: number, size: number, color: string, label?: string): string {
  const sw = size / 11;
  const r = size / 2 - sw;
  const c = 2 * Math.PI * r;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#3a3a3c" stroke-width="${sw}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round"
      stroke-dasharray="${(c * score) / 100} ${c}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="50%" y="50%" dy=".35em" text-anchor="middle" font-size="${size * 0.32}" font-weight="700" fill="#fff" font-family="inherit">${score}</text>
  </svg>${label ? `<div class="lbl">${label}</div>` : ''}`;
}

async function html(): Promise<string> {
  const logo = (await fs.readFile(path.join(ROOT, 'build', 'icon.svg'), 'utf8')).replace('<svg ', '<svg width="84" height="84" ');
  const minis = [['Lighthouse', 84, '#ffb340'], ['SEO', 92, '#30d158'], ['Speed', 63, '#ffb340'], ['iPhone', 88, '#ffb340'], ['Memory', 96, '#30d158'], ['Links', 100, '#30d158']] as const;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #000; }
  body { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI Variable Display", "Segoe UI", Inter, sans-serif; color: #f5f5f7; position: relative; }
  .glow { position: absolute; width: 760px; height: 760px; right: -200px; top: -240px; border-radius: 50%; background: radial-gradient(closest-side, rgba(41,151,255,0.30), rgba(41,151,255,0)); }
  .left { position: absolute; left: 72px; top: 64px; width: 640px; }
  .brand { display: flex; align-items: center; gap: 20px; }
  .brand span { font-size: 40px; font-weight: 600; letter-spacing: -0.5px; }
  h1 { font-size: 92px; line-height: 1.02; font-weight: 700; letter-spacing: -3px; margin-top: 70px; }
  h1 em { font-style: normal; color: #2997ff; }
  p.sub { font-size: 29px; line-height: 1.32; color: #c7c7cc; margin-top: 28px; letter-spacing: -0.2px; }
  .tags { position: absolute; left: 72px; bottom: 52px; display: flex; gap: 12px; }
  .tag { font-size: 20px; padding: 9px 20px; border-radius: 999px; background: #1d1d1f; border: 1px solid #3a3a3c; color: #e5e5ea; }
  .card { position: absolute; right: 64px; top: 38px; width: 468px; height: 564px; border-radius: 28px; background: #161617; border: 1px solid #2c2c2e; box-shadow: 0 30px 80px rgba(0,0,0,0.6); padding: 28px 30px; }
  .url { font-size: 19px; color: #98989d; display: flex; align-items: center; gap: 8px; }
  .url i { width: 10px; height: 10px; border-radius: 50%; background: #3a3a3c; display: inline-block; }
  .big { display: flex; align-items: center; gap: 26px; margin-top: 22px; }
  .big .t { font-size: 17px; color: #98989d; }
  .big .n { font-size: 30px; font-weight: 700; margin-top: 4px; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 26px; }
  .mini { background: #1d1d1f; border-radius: 18px; padding: 16px 0 12px; text-align: center; border: 1px solid #2c2c2e; }
  .lbl { font-size: 16px; color: #c7c7cc; margin-top: 8px; }
  </style></head><body>
    <div class="glow"></div>
    <div class="left">
      <div class="brand">${logo}<span>Sightline</span></div>
      <h1>Every detail.<br><em>Audited.</em></h1>
      <p class="sub">SEO, Lighthouse, links, memory leaks, iPhone and Cloudflare — one free, open-source audit.</p>
    </div>
    <div class="card">
      <div class="url"><i></i><i></i><i></i>&nbsp; yourwebsite.com</div>
      <div class="big">${ring(81, 150, '#ffb340')}<div><div class="t">Overall score</div><div class="n">Needs work</div></div></div>
      <div class="grid">${minis.map(([l, s, c]) => `<div class="mini">${ring(s, 78, c, l)}</div>`).join('')}</div>
    </div>
    <div class="tags"><span class="tag">Windows</span><span class="tag">macOS</span><span class="tag">Linux</span><span class="tag">Web</span><span class="tag">MCP</span></div>
  </body></html>`;
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: W, height: H, useContentSize: true, frame: false, webPreferences: { offscreen: true } });
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(await html())}`);
  await new Promise((r) => setTimeout(r, 700));
  const img = await win.webContents.capturePage();
  const png = img.resize({ width: W, height: H, quality: 'best' }).toPNG();
  await fs.writeFile(path.join(ROOT, 'build', 'social-preview.png'), png);
  await fs.writeFile(path.join(ROOT, 'web', 'public', 'assets', 'og.png'), png);
  console.log(`Wrote build/social-preview.png and web/public/assets/og.png (${W}x${H}, ${(png.length / 1024).toFixed(0)} KB)`);
  app.quit();
});
