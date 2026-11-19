import { BrowserWindow, session as electronSession } from 'electron';

export interface ProbeOptions {
  width: number;
  height: number;
  userAgent?: string;
  mobile?: boolean;
  deviceScaleFactor?: number;
  /** navigator.platform reported in mobile emulation (default iPhone) */
  platform?: string;
}

type CdpListener = (method: string, params: any) => void;

/** A hidden, sandboxed, throw-away browser window driven over the Chrome DevTools Protocol. */
export class Probe {
  readonly win: BrowserWindow;
  private listeners: CdpListener[] = [];

  private constructor(win: BrowserWindow) {
    this.win = win;
    win.webContents.debugger.on('message', (_e, method, params) => {
      for (const l of this.listeners) l(method, params);
    });
  }

  static async create(o: ProbeOptions): Promise<Probe> {
    const partition = `sightline-probe-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const ses = electronSession.fromPartition(partition, { cache: false });
    ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
    ses.on('will-download', (e) => e.preventDefault());
    const win = new BrowserWindow({
      show: false,
      width: o.width,
      height: o.height,
      webPreferences: {
        offscreen: true,
        partition,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
        javascript: true,
      },
    });
    win.webContents.setAudioMuted(true);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.setFrameRate(30);
    if (o.userAgent) win.webContents.setUserAgent(o.userAgent);
    // DevTools commands only get answered once a renderer exists, so load a blank page first.
    await win.loadURL('about:blank');
    win.webContents.debugger.attach('1.3');
    const p = new Probe(win);
    await p.cdp('Page.enable');
    await p.cdp('Runtime.enable');
    await p.cdp('Network.enable');
    await p.cdp('Performance.enable');
    await p.cdp('Log.enable');
    if (o.mobile) {
      await p.cdp('Emulation.setDeviceMetricsOverride', {
        width: o.width, height: o.height, deviceScaleFactor: o.deviceScaleFactor ?? 3, mobile: true,
        screenWidth: o.width, screenHeight: o.height,
      });
      await p.cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      if (o.userAgent) await p.cdp('Emulation.setUserAgentOverride', { userAgent: o.userAgent, platform: o.platform ?? 'iPhone' });
    }
    return p;
  }

  /** Send a DevTools command; never hangs longer than timeoutMs (a crashed renderer would otherwise block forever). */
  cdp<T = any>(method: string, params: Record<string, unknown> = {}, timeoutMs = 30000): Promise<T> {
    if (this.win.isDestroyed()) return Promise.reject(new Error('Probe window closed'));
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${method} timed out`)), timeoutMs);
      (this.win.webContents.debugger.sendCommand(method, params) as Promise<T>).then(
        (v) => { clearTimeout(timer); resolve(v); },
        (e) => { clearTimeout(timer); reject(e); },
      );
    });
  }

  on(fn: CdpListener): void { this.listeners.push(fn); }

  async addInitScript(source: string): Promise<void> {
    await this.cdp('Page.addScriptToEvaluateOnNewDocument', { source });
  }

  /** Navigate and wait for load (or timeout), then let the page settle. */
  async goto(url: string, timeoutMs = 45000, settleMs = 2500): Promise<{ loaded: boolean; error?: string }> {
    const wc = this.win.webContents;
    const loaded = await new Promise<{ loaded: boolean; error?: string }>((resolve) => {
      const timer = setTimeout(() => resolve({ loaded: false, error: `Load timed out after ${timeoutMs / 1000}s` }), timeoutMs);
      wc.once('did-finish-load', () => { clearTimeout(timer); resolve({ loaded: true }); });
      wc.loadURL(url).catch((e: Error) => {
        // ERR_ABORTED is common for client-side redirects; did-finish-load may still fire.
        if (!/ERR_ABORTED/.test(e.message)) { clearTimeout(timer); resolve({ loaded: false, error: e.message }); }
      });
    });
    await wait(settleMs);
    return loaded;
  }

  async evaluate<T = any>(expression: string, awaitPromise = true): Promise<T> {
    const r = await this.cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value as T;
  }

  async screenshot(quality = 70): Promise<string | undefined> {
    try {
      const r = await this.cdp('Page.captureScreenshot', { format: 'jpeg', quality });
      return `data:image/jpeg;base64,${r.data}`;
    } catch {
      try {
        const img = await this.win.webContents.capturePage();
        return `data:image/jpeg;base64,${img.toJPEG(quality).toString('base64')}`;
      } catch { return undefined; }
    }
  }

  close(): void {
    try { this.win.webContents.debugger.detach(); } catch { /* already detached */ }
    if (!this.win.isDestroyed()) this.win.destroy();
  }
}

export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
