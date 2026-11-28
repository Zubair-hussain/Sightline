declare namespace SL {
  interface Settings {
    language: string;
    theme: 'system' | 'light' | 'dark';
    maxPages: number;
    maxLinks: number;
    memoryIterations: number;
    device: 'iphone' | 'ipad';
    modules: CategoryKey[];
    cloudflareToken: string;
    /** 'brand' styles exported reports like the audited site; 'sightline' uses the house style */
    reportTheme: 'brand' | 'sightline';
    lighthouseFormFactor: 'mobile' | 'desktop';
    memoryScenario: MemoryScenario;
    /** sites the user confirmed they may test with the memory/interaction test */
    memoryConsent: string[];
    /** Version of TERMS.md the user accepted ('' = not yet). */
    termsAccepted: string;
    /** Release the user chose to skip in the update pop-up. */
    dismissedUpdate: string;
  }

  interface UpdateInfo {
    current: string;
    latest: string | null;
    available: boolean;
    /** Release notes (Markdown) of the latest release. */
    notes: string;
    releaseUrl?: string;
    releasesUrl: string;
    /** Download page for this computer's system. */
    downloadUrl: string;
    publishedAt: string | null;
    checkedAt: string;
    error?: string;
  }

  interface HistoryItem { id: string; url: string; score: number | null; startedAt: string }

  interface Bridge {
    startAudit(opts: Partial<AuditOptions> & { url: string }): Promise<{ ok: true; report: Report } | { ok: false; error: string }>;
    cancelAudit(): Promise<void>;
    onProgress(cb: (p: Progress) => void): () => void;
    exportReport(report: Report, format: 'json' | 'pdf' | 'html'): Promise<string | null>;
    exportTestCases(report: Report, cases: TestCase[], format: TestCaseFormat): Promise<string | null>;
    getSettings(): Promise<Settings>;
    setSettings(s: Partial<Settings>): Promise<Settings>;
    listHistory(): Promise<HistoryItem[]>;
    loadHistory(id: string): Promise<Report | null>;
    deleteHistory(id: string): Promise<void>;
    openExternal(url: string): Promise<void>;
    info(): Promise<AppInfo>;
    /** TERMS.md and its version (desktop app). */
    terms(): Promise<{ version: string; markdown: string }>;
    /** CHANGELOG.md shipped with this version. */
    changelog(): Promise<string>;
    /** Latest release on GitHub; cached for a day unless force is true. */
    checkUpdates(force?: boolean): Promise<UpdateInfo>;
    quit(): Promise<void>;
  }

  type TestCaseFormat = 'csv' | 'md' | 'playwright';

  interface AppInfo {
    version: string;
    platform: string;
    electron: string;
    chrome: string;
    locale: string;
    /** true when the UI runs on the website instead of the desktop app */
    web?: boolean;
    /** where to download the desktop app */
    downloadUrl?: string;
    /** MCP client config for connecting AI apps (desktop only) */
    mcpConfig?: string;
  }
}

interface Window { sightline: SL.Bridge }
