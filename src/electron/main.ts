import { app, BrowserWindow, ipcMain, dialog, shell, safeStorage, nativeTheme, Menu } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { runAudit, ALL_MODULES, VERSION } from '../engine';
import { renderHtmlReport } from '../engine/report-html';
import { auditPerformance } from './audits/performance';
import { auditMobile } from './audits/mobile';
import { auditMemory } from './audits/memory';
import { startMcpServer } from '../mcp/server';
import { auditLighthouse } from './audits/lighthouse';
import { auditCoverage } from './audits/coverage';
import { testCasesToCsv, testCasesToMarkdown, testCasesToPlaywright } from '../engine/testcases';

const isDev = process.argv.includes('--dev');
const ROOT = path.join(__dirname, '..', '..');
let mainWindow: BrowserWindow | null = null;
let current: { cancelled: boolean } | null = null;

const browserRunner: SL.BrowserRunner = {
  performance: auditPerformance,
  mobile: auditMobile,
  memory: auditMemory,
  lighthouse: auditLighthouse,
  coverage: auditCoverage,
};

// ---------- persistence ----------
const userFile = (name: string) => path.join(app.getPath('userData'), name);

const DEFAULT_SETTINGS: SL.Settings = {
  language: 'auto', theme: 'system', maxPages: 15, maxLinks: 150, memoryIterations: 8,
  device: 'iphone', modules: ALL_MODULES, cloudflareToken: '', reportTheme: 'brand',
  lighthouseFormFactor: 'mobile', memoryScenario: { mode: 'auto', steps: [], includeAuto: true }, memoryConsent: [],
};

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try { return JSON.parse(await fs.readFile(file, 'utf8')) as T; } catch { return fallback; }
}
async function writeJson(file: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
}

async function getSettings(): Promise<SL.Settings> {
  const raw = await readJson<Partial<SL.Settings> & { cloudflareTokenEnc?: string }>(userFile('settings.json'), {});
  let token = '';
  if (raw.cloudflareTokenEnc && safeStorage.isEncryptionAvailable()) {
    try { token = safeStorage.decryptString(Buffer.from(raw.cloudflareTokenEnc, 'base64')); } catch { token = ''; }
  }
  const { cloudflareTokenEnc: _enc, ...rest } = raw;
  return { ...DEFAULT_SETTINGS, ...rest, cloudflareToken: token };
}

async function setSettings(patch: Partial<SL.Settings>): Promise<SL.Settings> {
  const merged = { ...(await getSettings()), ...patch };
  const { cloudflareToken, ...toSave } = merged;
  const out: Record<string, unknown> = { ...toSave };
  // The API token is only persisted when the OS keychain can encrypt it.
  if (cloudflareToken && safeStorage.isEncryptionAvailable()) out.cloudflareTokenEnc = safeStorage.encryptString(cloudflareToken).toString('base64');
  await writeJson(userFile('settings.json'), out);
  nativeTheme.themeSource = merged.theme;
  return merged;
}

const historyDir = () => userFile('history');

function stripHeavy(report: SL.Report): SL.Report {
  const copy: SL.Report = JSON.parse(JSON.stringify(report));
  for (const c of Object.values(copy.categories)) {
    if (c?.data && 'screenshot' in c.data) delete (c.data as { screenshot?: string }).screenshot;
  }
  return copy;
}

async function saveHistory(report: SL.Report): Promise<void> {
  const id = `${Date.now()}`;
  await writeJson(path.join(historyDir(), `${id}.json`), stripHeavy(report));
  const index = await readJson<SL.HistoryItem[]>(path.join(historyDir(), 'index.json'), []);
  index.unshift({ id, url: report.finalUrl, score: report.score, startedAt: report.startedAt });
  for (const old of index.splice(100)) await fs.rm(path.join(historyDir(), `${old.id}.json`), { force: true });
  await writeJson(path.join(historyDir(), 'index.json'), index);
}

// ---------- window ----------
function createWindow(): void {
  const isMac = process.platform === 'darwin';
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 380,
    minHeight: 600,
    title: 'Sightline',
    backgroundColor: '#f5f5f7',
    icon: path.join(ROOT, 'build', 'icon.png'),
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    ...(isMac ? { trafficLightPosition: { x: 16, y: 14 } } : { titleBarOverlay: { color: '#000000', symbolColor: '#ffffff', height: 44 } }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault());
  void mainWindow.loadFile(path.join(ROOT, 'renderer', 'index.html'));
  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });
}

// ---------- IPC ----------
ipcMain.handle('audit:start', async (e, opts: Partial<SL.AuditOptions> & { url: string }) => {
  if (current) return { ok: false, error: 'An audit is already running.' };
  const settings = await getSettings();
  // Interaction tests (memory) only run on sites the user explicitly confirmed in the warning dialog.
  let host = '';
  try { host = new URL(/^https?:\/\//i.test(opts.url) ? opts.url : `https://${opts.url}`).hostname; } catch { /* runAudit reports bad URLs */ }
  const modules = (opts.modules ?? settings.modules).filter((m) => m !== 'memory' || settings.memoryConsent.includes(host));
  current = { cancelled: false };
  try {
    const report = await runAudit(
      {
        maxPages: settings.maxPages, maxLinks: settings.maxLinks, memoryIterations: settings.memoryIterations,
        device: settings.device, cloudflareToken: settings.cloudflareToken || undefined,
        memoryScenario: settings.memoryScenario, lighthouseFormFactor: settings.lighthouseFormFactor,
        ...opts,
        modules,
      },
      browserRunner,
      (p) => {
        if (process.argv.some((a) => a.startsWith('--smoke='))) console.log(`[${p.pct}%] ${p.category ?? ''} ${p.step}`);
        if (!e.sender.isDestroyed()) e.sender.send('audit:progress', p);
      },
      current,
    );
    await saveHistory(report).catch(() => undefined);
    lastReport = report;
    return { ok: true, report };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  } finally {
    current = null;
  }
});

ipcMain.handle('audit:cancel', () => { if (current) current.cancelled = true; });

ipcMain.handle('report:export', async (_e, report: SL.Report, format: 'json' | 'pdf' | 'html') => {
  const host = new URL(report.finalUrl).hostname.replace(/[^a-z0-9.-]/gi, '_');
  const stamp = report.startedAt.slice(0, 10);
  const res = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: `sightline-${host}-${stamp}.${format}`,
    filters: [{ name: format.toUpperCase(), extensions: [format] }],
  });
  if (res.canceled || !res.filePath) return null;
  await writeReport(report, format, res.filePath, (await getSettings()).reportTheme);
  shell.showItemInFolder(res.filePath);
  return res.filePath;
});

async function writeReport(report: SL.Report, format: 'json' | 'pdf' | 'html', filePath: string, theme: SL.Settings['reportTheme']): Promise<void> {
  if (format === 'json') {
    await fs.writeFile(filePath, JSON.stringify(report, null, 2), 'utf8');
  } else if (format === 'html') {
    await fs.writeFile(filePath, renderHtmlReport(report, { theme, target: 'html' }), 'utf8');
  } else {
    const tmp = path.join(app.getPath('temp'), `sightline-report-${Date.now()}.html`);
    await fs.writeFile(tmp, renderHtmlReport(report, { theme, target: 'pdf' }), 'utf8');
    // Scripts off: the report is static, and this keeps any page content inert while printing.
    const w = new BrowserWindow({ show: false, webPreferences: { javascript: false, offscreen: true } });
    try {
      await w.loadFile(tmp);
      const pdf = await w.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, margins: { top: 0, bottom: 0, left: 0, right: 0 } });
      await fs.writeFile(filePath, pdf);
    } finally {
      w.destroy();
      await fs.rm(tmp, { force: true });
    }
  }
}

let lastReport: SL.Report | null = null;

ipcMain.handle('testcases:export', async (_e, report: SL.Report, cases: SL.TestCase[], format: SL.TestCaseFormat) => {
  const host = new URL(report.finalUrl).hostname.replace(/[^a-z0-9.-]/gi, '_');
  const ext = format === 'playwright' ? 'spec.ts' : format;
  const res = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: format === 'playwright' ? 'launch.spec.ts' : `launch-test-plan-${host}.${ext}`,
    filters: [{ name: format === 'csv' ? 'CSV (Excel, Google Sheets)' : format === 'md' ? 'Markdown' : 'Playwright test (TypeScript)', extensions: [format === 'playwright' ? 'ts' : format] }],
  });
  if (res.canceled || !res.filePath) return null;
  const body = format === 'csv' ? testCasesToCsv(cases) : format === 'md' ? testCasesToMarkdown(cases, report) : testCasesToPlaywright(report);
  await fs.writeFile(res.filePath, body, 'utf8');
  shell.showItemInFolder(res.filePath);
  return res.filePath;
});

ipcMain.handle('settings:get', () => getSettings());
ipcMain.handle('settings:set', (_e, s: Partial<SL.Settings>) => setSettings(s));
ipcMain.handle('history:list', () => readJson<SL.HistoryItem[]>(path.join(historyDir(), 'index.json'), []));
ipcMain.handle('history:load', (_e, id: string) => readJson<SL.Report | null>(path.join(historyDir(), `${id.replace(/\D/g, '')}.json`), null));
ipcMain.handle('history:delete', async (_e, id: string) => {
  const safeId = id.replace(/\D/g, '');
  await fs.rm(path.join(historyDir(), `${safeId}.json`), { force: true });
  const index = await readJson<SL.HistoryItem[]>(path.join(historyDir(), 'index.json'), []);
  await writeJson(path.join(historyDir(), 'index.json'), index.filter((h) => h.id !== safeId));
});
ipcMain.handle('app:open-external', (_e, url: string) => { if (/^https?:\/\//.test(url)) return shell.openExternal(url); });
function mcpConfig(): string {
  // Packaged: the app binary itself. Development: electron.exe + project folder.
  const args = app.isPackaged ? ['--mcp'] : [ROOT, '--mcp'];
  return JSON.stringify({ mcpServers: { sightline: { command: process.execPath, args } } }, null, 2);
}

ipcMain.handle('app:info', (): SL.AppInfo => ({
  version: VERSION, platform: process.platform, electron: process.versions.electron, chrome: process.versions.chrome,
  locale: app.getLocale(), mcpConfig: mcpConfig(),
}));

// ---------- smoke test: drive the real UI and capture screenshots ----------
async function smoke(url: string, outDir: string): Promise<void> {
  const w = mainWindow!;
  const shot = async (name: string) => {
    const img = await w.webContents.capturePage();
    await fs.writeFile(path.join(outDir, `${name}.png`), img.toPNG());
  };
  const js = (code: string) => w.webContents.executeJavaScript(code);
  await fs.mkdir(outDir, { recursive: true });
  await new Promise((r) => setTimeout(r, 1500));
  await shot('01-home');
  await js(`(() => { const i = document.querySelector('.search input'); i.value = ${JSON.stringify(url)}; document.querySelector('.search').requestSubmit(); })()`);
  await new Promise((r) => setTimeout(r, 1200));
  // Safety dialog for the memory test: capture it, then confirm like a user would.
  if (await js(`!!document.querySelector('dialog.consent[open]')`)) {
    await shot('01b-consent');
    const blockedBeforeTick: boolean = await js(`document.querySelector('[data-consent-run]').disabled`);
    await fs.writeFile(path.join(outDir, 'consent.txt'), `run button disabled before tick: ${blockedBeforeTick}\n`);
    await js(`(() => { const c = document.getElementById('consent-own'); c.click(); document.querySelector('[data-consent-run]').click(); })()`);
  }
  await new Promise((r) => setTimeout(r, 6000));
  await shot('02-running');
  const t0 = Date.now();
  while (Date.now() - t0 < 600000) {
    const done = await js(`!!document.querySelector('.report-hero') || !!document.querySelector('.error-banner')`);
    if (done) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  await new Promise((r) => setTimeout(r, 1500));
  const height: number = await js('document.documentElement.scrollHeight');
  let i = 0;
  for (let y = 0; y < height && i < 14; y += 820, i++) {
    await js(`window.scrollTo(0, ${y})`);
    await new Promise((r) => setTimeout(r, 400));
    await shot(`03-report-${String(i).padStart(2, '0')}`);
  }
  const summary = await js(`[...document.querySelectorAll('section[id^=cat-]')].map(s => s.id + ' ' + s.querySelector('.ring text')?.textContent).join('\\n')`);
  await fs.writeFile(path.join(outDir, 'summary.txt'), String(summary));
  if (lastReport) {
    // Exercise the same export path the Export buttons use.
    await writeReport(lastReport, 'pdf', path.join(outDir, 'report-brand.pdf'), 'brand');
    await writeReport(lastReport, 'html', path.join(outDir, 'report-brand.html'), 'brand');
    await writeReport(lastReport, 'pdf', path.join(outDir, 'report-sightline.pdf'), 'sightline');
    await fs.writeFile(path.join(outDir, 'brand.json'), JSON.stringify({ ...lastReport.meta.brand, logo: lastReport.meta.brand?.logo?.slice(0, 40) }, null, 2));
    const cases = lastReport.testCases ?? [];
    await fs.writeFile(path.join(outDir, 'test-plan.csv'), testCasesToCsv(cases));
    await fs.writeFile(path.join(outDir, 'test-plan.md'), testCasesToMarkdown(cases, lastReport));
    await fs.writeFile(path.join(outDir, 'launch.spec.ts'), testCasesToPlaywright(lastReport));
    const pick = (k: SL.CategoryKey) => lastReport!.categories[k];
    await fs.writeFile(path.join(outDir, 'details.json'), JSON.stringify({
      lighthouse: pick('lighthouse')?.data && { ...(pick('lighthouse')!.data as object), error: pick('lighthouse')!.error },
      coverage: pick('coverage') && { js: (pick('coverage')!.data as SL.CoverageData).js, css: (pick('coverage')!.data as SL.CoverageData).css, error: pick('coverage')!.error, checks: pick('coverage')!.checks.map((c) => `${c.status} ${c.title}: ${c.detail}`) },
      memoryPlan: (pick('memory')?.data as SL.MemoryData | undefined)?.plan,
      memoryError: pick('memory')?.error,
    }, null, 2));
  }
  app.quit();
}

// ---------- lifecycle ----------
const mcpMode = process.argv.includes('--mcp');

app.whenReady().then(async () => {
  if (mcpMode) {
    // Headless MCP server for AI apps: no UI, all 8 modules available.
    app.dock?.hide();
    startMcpServer(browserRunner, () => app.quit());
    return;
  }
  nativeTheme.themeSource = (await getSettings()).theme;
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
  createWindow();
  const smokeArg = process.argv.find((a) => a.startsWith('--smoke='));
  if (smokeArg) {
    const outDir = process.argv.find((a) => a.startsWith('--out='))?.slice(6) || path.join(app.getPath('temp'), 'sightline-smoke');
    mainWindow!.webContents.once('did-finish-load', () => { void smoke(smokeArg.slice(8), outDir); });
  }
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

// In MCP mode only hidden probe windows exist; their closing must not end the server.
app.on('window-all-closed', () => { if (!mcpMode && process.platform !== 'darwin') app.quit(); });
