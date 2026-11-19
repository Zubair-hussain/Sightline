/* Renders the canonical logo/logo.svg into app, web and package assets. Run: npm run icon */
import { app, BrowserWindow } from 'electron';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const ROOT = path.join(__dirname, '..', '..');

app.whenReady().then(async () => {
  const source = path.join(ROOT, 'logo', 'logo.svg');
  const svg = await fs.readFile(source, 'utf8');
  const win = new BrowserWindow({ show: false, width: 600, height: 600, useContentSize: true, transparent: true, frame: false, webPreferences: { offscreen: true } });
  const html = `<html style="overflow:hidden"><body style="margin:0;overflow:hidden;background:transparent">${svg.replace('<svg ', '<svg width="600" height="600" style="display:block" ')}</body></html>`;
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await new Promise((r) => setTimeout(r, 500));
  const img = await win.webContents.capturePage();
  await fs.writeFile(path.join(ROOT, 'build', 'icon.png'), img.resize({ width: 1024, height: 1024, quality: 'best' }).toPNG());
  await fs.copyFile(source, path.join(ROOT, 'build', 'icon.svg'));
  await fs.writeFile(path.join(ROOT, 'logo', 'logo-1024.png'), img.resize({ width: 1024, height: 1024, quality: 'best' }).toPNG());
  await fs.mkdir(path.join(ROOT, 'renderer', 'assets'), { recursive: true });
  await fs.copyFile(source, path.join(ROOT, 'renderer', 'assets', 'logo.svg'));
  await fs.mkdir(path.join(ROOT, 'website', 'assets'), { recursive: true });
  await fs.writeFile(path.join(ROOT, 'website', 'assets', 'icon-180.png'), img.resize({ width: 180, height: 180, quality: 'best' }).toPNG());
  await fs.copyFile(source, path.join(ROOT, 'website', 'assets', 'icon.svg'));
  console.log('Wrote logo assets for the app, website and installers');
  app.quit();
});
