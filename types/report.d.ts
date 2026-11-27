/* Shared report types used by the engine, Electron main process and renderer. */

declare namespace SL {
  type Status = 'pass' | 'warn' | 'fail' | 'info';

  type CategoryKey = 'seo' | 'hreflang' | 'links' | 'website' | 'performance' | 'cloudflare' | 'mobile' | 'memory' | 'lighthouse' | 'coverage' | 'security';

  /** Lighthouse-style scores (0–100) for the four classic categories. */
  interface LighthouseData {
    formFactor: 'mobile' | 'desktop';
    scores: { performance: number | null; accessibility: number | null; bestPractices: number | null; seo: number | null };
    metrics: { fcp: number | null; lcp: number | null; tbt: number | null; cls: number | null; si: number | null };
    metricScores: Record<string, number | null>;
    axe: { violations: number; passes: number; incomplete: number; version: string };
    throttling: string;
  }

  interface CoverageFile { url: string; type: 'js' | 'css'; total: number; unused: number; pct: number; firstParty: boolean }
  interface CoverageData {
    js: { total: number; unused: number };
    css: { total: number; unused: number };
    files: CoverageFile[];
  }

  /** One step of a user-defined memory test scenario. */
  interface ScenarioStep {
    action: 'click' | 'navigate' | 'back' | 'type' | 'press' | 'scroll' | 'wait';
    selector?: string;
    value?: string;
  }

  interface MemoryScenario {
    mode: 'auto' | 'custom';
    steps: ScenarioStep[];
    /** also run the automatic cycle in custom mode */
    includeAuto: boolean;
  }

  type TestPriority = 'P0' | 'P1' | 'P2';
  type TestStatus = 'pass' | 'fail' | 'blocked' | 'not-run';
  interface TestCase {
    id: string;
    area: string;
    title: string;
    priority: TestPriority;
    type: 'automated' | 'manual';
    preconditions: string;
    steps: string[];
    expected: string;
    status: TestStatus;
    /** evidence from the audit when status was set automatically */
    evidence: string;
    notes: string;
  }

  interface Check {
    id: string;
    title: string;
    status: Status;
    detail: string;
    weight: number;
    fix: string;
    items: string[];
  }

  interface Summary { pass: number; warn: number; fail: number; info: number }

  interface Category<D = Record<string, unknown>> {
    key: CategoryKey;
    score: number | null;
    summary: Summary;
    checks: Check[];
    data: D;
    error?: string;
  }

  interface MemorySample {
    iteration: number;
    heapUsed: number;
    nodes: number;
    listeners: number;
    documents: number;
    intervals: number;
  }

  interface MemoryData {
    samples: MemorySample[];
    growthBytes: number;
    growthPct: number;
    slopeBytesPerIter: number;
    detachedNodes: number | null;
    verdict: 'clean' | 'suspicious' | 'leaking';
    spaNavigation: boolean;
    /** human-readable description of exactly what the test did */
    plan?: string[];
    scenarioMode?: 'auto' | 'custom';
  }

  interface PerformanceData {
    ttfb: number | null;
    fcp: number | null;
    lcp: number | null;
    cls: number | null;
    tbt: number | null;
    load: number | null;
    requests: number;
    transferBytes: number;
    byType: Record<string, { count: number; bytes: number }>;
    consoleErrors: string[];
    screenshot?: string;
    brandHints?: BrandHints;
  }

  /** Visual identity of the audited site, used to theme exported reports. */
  interface Brand {
    name: string;
    primary: string;
    onPrimary: string;
    background: string;
    text: string;
    fontHeading: string;
    fontBody: string;
    /** logo as a data: URL so reports work offline */
    logo?: string;
    source: 'computed' | 'meta' | 'default';
    /** whether the site permits being shown in an iframe */
    frameable: boolean;
  }

  /** Raw style hints read from the live page in the browser engine. */
  interface BrandHints {
    primary?: string;
    background?: string;
    text?: string;
    fontHeading?: string;
    fontBody?: string;
    logoUrl?: string;
  }

  interface MobileData {
    device: string;
    width: number;
    height: number;
    screenshot?: string;
  }

  interface AuditOptions {
    url: string;
    maxPages: number;
    maxLinks: number;
    modules: CategoryKey[];
    memoryIterations: number;
    memoryScenario?: MemoryScenario;
    lighthouseFormFactor?: 'mobile' | 'desktop';
    cloudflareToken?: string;
    device?: 'iphone' | 'ipad';
  }

  interface Report {
    version: string;
    url: string;
    finalUrl: string;
    startedAt: string;
    durationMs: number;
    score: number | null;
    categories: Partial<Record<CategoryKey, Category<any>>>;
    meta: { status: number; title: string; server: string; redirects: { url: string; status: number }[]; brand?: Brand };
    /** launch-day test plan generated from this audit */
    testCases?: TestCase[];
  }

  interface Progress { step: string; pct: number; category?: CategoryKey }

  interface BrowserRunner {
    performance(url: string): Promise<Category<PerformanceData>>;
    mobile(url: string, device: 'iphone' | 'ipad'): Promise<Category<MobileData>>;
    memory(url: string, iterations: number, onStep: (s: string) => void, scenario?: MemoryScenario): Promise<Category<MemoryData>>;
    lighthouse(url: string, formFactor: 'mobile' | 'desktop', onStep: (s: string) => void): Promise<Category<LighthouseData>>;
    coverage(url: string): Promise<Category<CoverageData>>;
  }
}
