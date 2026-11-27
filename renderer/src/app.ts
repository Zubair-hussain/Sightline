import { h, icon, clear, fmtBytes, fmtMs } from './dom.js';
import { ring, heapChart, grade } from './charts.js';
import { t, setLanguage, resolveLanguage, LANGUAGES, currentLocale, type Key } from './i18n.js';
import { describe, DETAIL, DESKTOP_ONLY } from './about.js';
import { confirmMemoryTest, stepRisk } from './consent.js';
import { renderTestCases } from './testcases-view.js';

type View = 'home' | 'running' | 'report' | 'history' | 'settings';
type Filter = 'all' | 'issues' | 'pass';

const ORDER: SL.CategoryKey[] = ['lighthouse', 'seo', 'performance', 'coverage', 'mobile', 'memory', 'website', 'links', 'hreflang', 'cloudflare', 'security', 'secrets'];
const TILE: Record<SL.CategoryKey, string> = {
  lighthouse: 'tile-dark', seo: 'tile-light', performance: 'tile-parchment', coverage: 'tile-light', mobile: 'tile-dark', memory: 'tile-dark-2',
  website: 'tile-light', links: 'tile-parchment', hreflang: 'tile-light', cloudflare: 'tile-dark', security: 'tile-parchment', secrets: 'tile-dark',
};
const RANK: Record<SL.Status, number> = { fail: 0, warn: 1, pass: 2, info: 3 };

const api = window.sightline;
const state = {
  view: 'home' as View,
  settings: null as SL.Settings | null,
  info: null as SL.AppInfo | null,
  report: null as SL.Report | null,
  url: '',
  error: '',
  progress: { step: '', pct: 0 } as SL.Progress,
  done: new Set<SL.CategoryKey>(),
  history: [] as SL.HistoryItem[],
  filters: {} as Partial<Record<SL.CategoryKey, Filter>>,
};

const $view = document.getElementById('view')!;
const $subnav = document.getElementById('subnav')!;
const catName = (k: SL.CategoryKey) => t(`cat.${k}` as Key);
const host = (u: string) => { try { return new URL(u).hostname; } catch { return u; } };

// ---------- theme & language ----------
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme(): void {
  const pref = state.settings?.theme ?? 'system';
  const dark = pref === 'dark' || (pref === 'system' && darkQuery.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
darkQuery.addEventListener('change', applyTheme);

function applyLanguage(): void {
  setLanguage(resolveLanguage(state.settings?.language ?? 'auto', state.info?.locale ?? navigator.language));
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n as Key); });
  const fc = document.getElementById('footer-cats')!;
  clear(fc);
  fc.append(h('h4', {}, t('modules.title')), ...ORDER.map((k) => h('a', { href: '#' }, catName(k))));
  const sel = document.getElementById('footer-lang') as HTMLSelectElement;
  clear(sel);
  sel.append(h('option', { value: 'auto' }, 'Auto'), ...LANGUAGES.map((l) => h('option', { value: l.code }, l.name)));
  sel.value = state.settings?.language ?? 'auto';
}

// ---------- navigation ----------
function go(view: View): void {
  if (state.view === 'running' && view !== 'running') return; // keep focus on the running audit
  state.view = view;
  render();
  window.scrollTo({ top: 0 });
}

document.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-go]');
  if (el) { e.preventDefault(); go(el.dataset.go as View); }
});

function render(): void {
  clear($view);
  $subnav.hidden = true;
  document.querySelectorAll<HTMLElement>('.global-nav nav button').forEach((b) => {
    const cur = b.dataset.go === state.view || (b.dataset.go === 'home' && (state.view === 'report' || state.view === 'running'));
    if (cur) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  ({ home: renderHome, running: renderRunning, report: renderReport, history: renderHistory, settings: renderSettings })[state.view]();
}

// ---------- home ----------
function renderHome(): void {
  const s = state.settings!;
  const input = h('input', { type: 'text', inputmode: 'url', autocomplete: 'url', spellcheck: 'false', placeholder: t('hero.placeholder'), 'aria-label': t('hero.placeholder'), value: state.url }) as HTMLInputElement;
  const form = h('form', { class: 'search', role: 'search' },
    h('label', { class: 'field' }, icon('search'), input),
    h('button', { class: 'btn btn-primary btn-hero', type: 'submit' }, t('hero.button')),
  );
  form.addEventListener('submit', (e) => { e.preventDefault(); void start(input.value); });

  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': t('modules.title') },
    h('div', { class: 'chips-label caption muted' }, t('modules.title')),
    ORDER.map((k) => {
      if (isWeb() && DESKTOP_ONLY.includes(k)) {
        return h('span', { class: 'chip chip-disabled', title: t('web.desktopNote') }, icon(k), catName(k), h('span', { class: 'badge' }, t('web.desktopOnly')));
      }
      const on = s.modules.includes(k);
      const chip = h('button', { class: 'chip', type: 'button', 'aria-pressed': String(on), title: describe(currentLocale(), k) }, icon(k), catName(k));
      chip.addEventListener('click', async () => {
        const next = s.modules.includes(k) ? s.modules.filter((m) => m !== k) : [...s.modules, k];
        if (!next.length) return;
        state.settings = await api.setSettings({ modules: next });
        chip.setAttribute('aria-pressed', String(next.includes(k)));
      });
      return chip;
    }),
  );

  $view.append(
    h('section', { class: 'tile tile-parchment' },
      h('div', { class: 'inner' },
        h('p', { class: 'eyebrow' }, t('hero.eyebrow')),
        h('h1', { class: 'hero-display' }, t('hero.title')),
        h('p', { class: 'lead' }, t('hero.lead')),
        form,
        state.error ? h('p', { class: 'error-banner', role: 'alert' }, `${t('error.title')}: ${state.error}`) : null,
        chips,
        isWeb() ? h('p', { class: 'web-note' }, t('web.desktopNote'), ' ', h('a', { href: state.info?.downloadUrl ?? '/#download', target: '_top' }, `${t('web.getApp')} ›`)) : null,
      ),
    ),
  );

  // What each module does — in plain language
  $view.append(h('section', { class: 'tile tile-dark on-dark' },
    h('div', { class: 'inner' },
      h('h2', { class: 'display-lg', style: 'margin-bottom:12px' }, t('features.title')),
      h('p', { class: 'lead muted', style: 'margin-bottom:48px' }, t('features.lead')),
      h('div', { class: 'grid' }, ORDER.map((k) => featureCard(k))),
    ),
  ));

  if (state.history.length) {
    $view.append(h('section', { class: 'tile tile-light' },
      h('div', { class: 'inner', style: 'max-width:820px' },
        h('h2', { class: 'display-lg', style: 'margin-bottom:28px' }, t('recent.title')),
        historyList(state.history.slice(0, 5)),
      ),
    ));
  }
  setTimeout(() => input.focus(), 50);
}

function featureCard(k: SL.CategoryKey): HTMLElement {
  const d = DETAIL[k];
  const ic = icon(k);
  ic.setAttribute('width', '32');
  ic.setAttribute('height', '32');
  const more = h('div', { class: 'feature-more', hidden: true },
    h('ul', {}, d.checks.map((c) => h('li', {}, c))),
    h('p', {}, h('strong', {}, `${t('features.why')} `), d.why),
  );
  const toggle = h('button', { class: 'text-link caption', type: 'button', 'aria-expanded': 'false' }, t('features.what'));
  toggle.addEventListener('click', () => {
    more.hidden = !more.hidden;
    toggle.setAttribute('aria-expanded', String(!more.hidden));
  });
  const desktopOnly = isWeb() && DESKTOP_ONLY.includes(k);
  return h('div', { class: 'feature-card' },
    ic,
    h('div', { class: 'name' }, catName(k)),
    desktopOnly ? h('span', { class: 'badge' }, t('web.desktopOnly')) : null,
    h('p', { class: 'desc' }, describe(currentLocale(), k)),
    toggle,
    more,
  );
}

const isWeb = () => Boolean(state.info?.web);

// ---------- running ----------
let $step: HTMLElement | null = null;
let $pct: SVGTextElement | null = null;
let $arc: SVGCircleElement | null = null;
let $mods: HTMLElement | null = null;

function renderRunning(): void {
  const size = 180, r = 80, c = 2 * Math.PI * r;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('class', 'progress-ring');
  svg.innerHTML = `<circle class="track" cx="90" cy="90" r="${r}"/><circle class="value" cx="90" cy="90" r="${r}" stroke-dasharray="0 ${c}" transform="rotate(-90 90 90)"/><text x="50%" y="50%" dy=".35em" text-anchor="middle">0</text>`;
  $arc = svg.querySelector('.value');
  $pct = svg.querySelector('text');
  $step = h('p', { class: 'step-text', 'aria-live': 'polite' });
  $mods = h('div', { class: 'module-progress' });
  const cancel = h('button', { class: 'btn btn-secondary btn-small', type: 'button' }, t('run.cancel'));
  cancel.addEventListener('click', () => { void api.cancelAudit(); cancel.setAttribute('disabled', ''); });
  $view.append(h('section', { class: 'tile tile-dark on-dark running' },
    h('div', { class: 'inner' },
      svg,
      h('p', { class: 'eyebrow', style: 'color:var(--body-muted)' }, t('run.title')),
      h('h1', { class: 'display-lg' }, host(state.url)),
      $step, $mods, cancel,
    ),
  ));
  updateProgress();
}

function updateProgress(): void {
  if (!$arc || !$pct || !$step || !$mods) return;
  const c = 2 * Math.PI * 80;
  $arc.setAttribute('stroke-dasharray', `${(c * state.progress.pct) / 100} ${c}`);
  $pct.textContent = `${state.progress.pct}`;
  $step.textContent = state.progress.step;
  clear($mods);
  for (const k of ORDER.filter((m) => state.settings!.modules.includes(m) && !(isWeb() && DESKTOP_ONLY.includes(m)))) {
    const active = state.progress.category === k;
    const done = state.done.has(k);
    $mods.append(h('span', { class: active ? 'active' : done ? 'done' : '' }, done ? icon('check') : null, catName(k)));
  }
}

api.onProgress((p) => {
  if (state.progress.category && p.category !== state.progress.category) state.done.add(state.progress.category);
  state.progress = p;
  updateProgress();
});

async function start(raw: string): Promise<void> {
  const url = raw.trim();
  if (!url) return;
  state.url = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  state.error = '';
  // The memory test interacts with the site, so it needs an explicit, informed OK per site.
  let modules = state.settings!.modules;
  const site = host(state.url);
  if (!isWeb() && modules.includes('memory') && !state.settings!.memoryConsent.includes(site)) {
    const answer = await confirmMemoryTest(site, state.settings!);
    if (answer === 'cancel') return;
    if (answer === 'run') state.settings = await api.setSettings({ memoryConsent: [...state.settings!.memoryConsent, site] });
    else modules = modules.filter((m) => m !== 'memory');
  }
  state.done = new Set();
  state.progress = { step: '', pct: 0 };
  state.view = 'running';
  render();
  const res = await api.startAudit({ url: state.url, modules });
  state.view = 'home';
  if (res.ok) {
    state.report = res.report;
    state.filters = {};
    state.history = await api.listHistory();
    go('report');
  } else {
    state.error = res.error;
    render();
  }
}

// ---------- report ----------
function renderReport(): void {
  const r = state.report;
  if (!r) return go('home');
  const cats = ORDER.filter((k) => r.categories[k]);

  // sub-nav
  $subnav.hidden = false;
  document.getElementById('subnav-title')!.textContent = host(r.finalUrl);
  const links = document.getElementById('subnav-links')!;
  clear(links);
  links.append(...cats.map((k) => {
    const a = h('a', { href: `#cat-${k}` }, catName(k));
    a.addEventListener('click', (e) => { e.preventDefault(); document.getElementById(`cat-${k}`)?.scrollIntoView({ behavior: 'smooth' }); });
    return a;
  }));
  const act = document.getElementById('subnav-action')!;
  clear(act);
  act.append(exportBtn('pdf', t('report.exportPdf'), 'btn btn-primary btn-small'));
  if (r.testCases?.length) {
    const tc = h('a', { href: '#test-cases' }, t('tc.title'));
    tc.addEventListener('click', (e) => { e.preventDefault(); document.getElementById('test-cases')?.scrollIntoView({ behavior: 'smooth' }); });
    links.append(tc);
  }

  const totals = cats.reduce((a, k) => { const s = r.categories[k]!.summary; a.pass += s.pass; a.warn += s.warn; a.fail += s.fail; return a; }, { pass: 0, warn: 0, fail: 0 });
  const newBtn = h('button', { class: 'btn btn-secondary', type: 'button' }, t('report.newAudit'));
  newBtn.addEventListener('click', () => { state.url = ''; go('home'); });

  $view.append(h('section', { class: 'tile tile-dark on-dark' },
    h('div', { class: 'inner report-hero' },
      ring(r.score, 200, 12),
      h('div', { class: 'meta' },
        h('p', { class: 'eyebrow', style: 'color:var(--body-muted)' }, t('report.overall')),
        h('h1', { class: 'display-lg' }, r.meta.title || host(r.finalUrl)),
        h('p', { class: 'url' }, r.finalUrl),
        h('p', { class: 'caption muted' },
          `${totals.pass} ${t('report.passed')} · ${totals.warn} ${t('report.warnings')} · ${totals.fail} ${t('report.failed')} · ${t('report.duration')} ${(r.durationMs / 1000).toFixed(1)} s · ${new Date(r.startedAt).toLocaleString()}`),
        h('div', { class: 'actions' },
          exportBtn('pdf', t('report.exportPdf'), 'btn btn-primary'),
          exportBtn('html', t('report.exportHtml'), 'btn btn-secondary'),
          exportBtn('json', t('report.exportJson'), 'btn btn-secondary'),
          newBtn,
        ),
      ),
    ),
  ));

  $view.append(h('section', { class: 'tile tile-parchment' },
    h('div', { class: 'inner' },
      h('h2', { class: 'display-lg', style: 'margin-bottom:32px' }, t('report.categories')),
      h('div', { class: 'grid' }, cats.map((k) => {
        const c = r.categories[k]!;
        const card = h('button', { class: 'card clickable cat-card', type: 'button' },
          ring(c.score, 84, 7),
          h('span', { class: 'name' }, catName(k)),
          h('span', { class: 'counts' }, `${c.summary.fail} ${t('report.failed')} · ${c.summary.warn} ${t('report.warnings')}`),
        );
        card.addEventListener('click', () => document.getElementById(`cat-${k}`)?.scrollIntoView({ behavior: 'smooth' }));
        return card;
      })),
    ),
  ));

  for (const k of cats) $view.append(categorySection(k, r.categories[k]!));
  if (r.testCases?.length) $view.append(renderTestCases(r, api));
}

function exportBtn(format: 'pdf' | 'html' | 'json', label: string, cls: string): HTMLElement {
  const b = h('button', { class: cls, type: 'button' }, label);
  b.addEventListener('click', async () => {
    b.setAttribute('disabled', '');
    try { await api.exportReport(state.report!, format); } finally { b.removeAttribute('disabled'); }
  });
  return b;
}

function categorySection(k: SL.CategoryKey, c: SL.Category): HTMLElement {
  const tileCls = TILE[k];
  const dark = tileCls.includes('dark');
  const hasIssues = c.summary.fail + c.summary.warn > 0;
  state.filters[k] ??= hasIssues ? 'issues' : 'all';
  const listWrap = h('div');
  const drawList = () => { clear(listWrap); listWrap.append(checkList(c.checks, state.filters[k]!)); };

  const seg = h('div', { class: 'segmented', role: 'group' }, (['issues', 'all', 'pass'] as Filter[]).map((f) => {
    const b = h('button', { type: 'button', 'aria-pressed': String(state.filters[k] === f) }, t(f === 'issues' ? 'filter.issues' : f === 'all' ? 'filter.all' : 'filter.passed'));
    b.addEventListener('click', () => {
      state.filters[k] = f;
      seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      drawList();
    });
    return b;
  }));
  drawList();

  const g = grade(c.score);
  return h('section', { class: `tile ${tileCls}${dark ? ' on-dark' : ''}`, id: `cat-${k}` },
    h('div', { class: 'inner' },
      h('div', { class: 'section-head' },
        h('div', { class: 'left' },
          ring(c.score, 88, 7),
          h('div', { style: 'text-align:start' },
            h('h2', { class: 'display-lg' }, catName(k)),
            h('p', { class: 'caption muted', style: 'margin:6px 0 0;max-width:620px' }, describe(currentLocale(), k)),
            h('p', { class: 'caption muted', style: 'margin:6px 0 0' },
              h('span', { class: `grade-label ${g}` }, icon(g === 'good' ? 'pass' : g === 'warn' ? 'warn' : g === 'bad' ? 'fail' : 'info', 'status-icon'), ''),
              ` ${c.summary.pass} ${t('report.passed')} · ${c.summary.warn} ${t('report.warnings')} · ${c.summary.fail} ${t('report.failed')}`),
          ),
        ),
        seg,
      ),
      extras(k, c),
      listWrap,
    ),
  );
}

function stat(value: string, unit: string, label: string): HTMLElement {
  return h('div', { class: 'stat' }, h('div', { class: 'value' }, value, unit ? h('small', {}, unit) : null), h('div', { class: 'label' }, label));
}

function extras(k: SL.CategoryKey, c: SL.Category): HTMLElement | null {
  const d = c.data as Record<string, any>;
  if (c.error) return null;
  switch (k) {
    case 'lighthouse': {
      const l = d as SL.LighthouseData;
      if (!l.scores) return null;
      const gauge = (label: Key, v: number | null) => h('div', { class: 'lh-gauge' }, ring(v, 112, 8), h('div', { class: 'lh-label' }, t(label)));
      const met = (name: string, value: string, score: number | null | undefined) =>
        h('div', { class: `lh-metric ${grade(score ?? null)}` }, h('span', { class: 'lh-dot', 'aria-hidden': 'true' }), h('div', {}, h('div', { class: 'lh-mname' }, name), h('div', { class: 'lh-mval' }, value)));
      const msv = (v: number | null) => { const [a, b] = fmtMs(v); return `${a} ${b}`.trim(); };
      return h('div', {},
        h('div', { class: 'lh-gauges' },
          gauge('lh.performance', l.scores.performance), gauge('lh.accessibility', l.scores.accessibility),
          gauge('lh.bestPractices', l.scores.bestPractices), gauge('lh.seo', l.scores.seo)),
        h('div', { class: 'lh-metrics' },
          met('First Contentful Paint', msv(l.metrics.fcp), l.metricScores.fcp),
          met('Largest Contentful Paint', msv(l.metrics.lcp), l.metricScores.lcp),
          met('Total Blocking Time', msv(l.metrics.tbt), l.metricScores.tbt),
          met('Cumulative Layout Shift', l.metrics.cls == null ? '—' : l.metrics.cls.toFixed(3), l.metricScores.cls),
          met('Speed Index', msv(l.metrics.si), l.metricScores.si)),
        h('p', { class: 'caption muted', style: 'text-align:start;margin:0 0 28px' }, l.throttling),
      );
    }
    case 'coverage': {
      const cv = d as SL.CoverageData;
      if (!cv.files) return null;
      const pct = (x: { total: number; unused: number }) => (x.total ? Math.round((x.unused / x.total) * 100) : 0);
      return h('div', {},
        h('div', { class: 'stats' },
          stat(fmtBytes(cv.js.unused), '', `${t('cov.js')} (${pct(cv.js)}%)`),
          stat(fmtBytes(cv.css.unused), '', `${t('cov.css')} (${pct(cv.css)}%)`),
          stat(fmtBytes(cv.js.total + cv.css.total), '', 'JS + CSS')),
        h('div', { class: 'cov-list' }, cv.files.slice(0, 10).map((f) => h('div', { class: 'cov-row' },
          h('span', { class: 'cov-type' }, f.type.toUpperCase()),
          h('span', { class: 'cov-url', title: f.url }, f.url.replace(/^https?:\/\//, '')),
          h('span', { class: 'cov-bar', role: 'img', 'aria-label': `${f.pct}% unused` }, h('i', { style: `width:${f.pct}%` })),
          h('span', { class: 'cov-num' }, `${fmtBytes(f.unused)} / ${fmtBytes(f.total)}`)))),
      );
    }
    case 'performance': {
      const p = d as SL.PerformanceData;
      return h('div', {},
        h('p', { class: 'tagline', style: 'text-align:start;margin-bottom:16px' }, t('perf.vitals')),
        h('div', { class: 'stats' },
          stat(...fmtMs(p.lcp), 'LCP'), stat(...fmtMs(p.fcp), 'FCP'), stat(p.cls == null ? '—' : p.cls.toFixed(3), '', 'CLS'),
          stat(...fmtMs(p.tbt), 'TBT'), stat(String(p.requests), '', t('perf.requests')), stat(fmtBytes(p.transferBytes), '', t('perf.weight')),
        ),
        p.screenshot ? h('div', { class: 'desktop-shot', style: 'margin-bottom:32px' }, h('div', { class: 'bar' }, h('i'), h('i'), h('i')), h('img', { src: p.screenshot, alt: 'Desktop screenshot of the audited page' })) : null,
      );
    }
    case 'mobile': {
      const m = d as SL.MobileData;
      if (!m.screenshot) return null;
      const isPad = m.device.startsWith('iPad');
      return h('div', { class: 'device-wrap', style: 'margin-bottom:40px' },
        h('div', { class: `device${isPad ? ' ipad' : ''}` },
          h('div', { class: 'screen' },
            h('div', { class: 'status-bar' }, isPad ? null : h('div', { class: 'island' })),
            h('img', { src: m.screenshot, alt: `Screenshot on ${m.device}` }),
          ),
        ),
        h('div', {},
          h('p', { class: 'eyebrow', style: 'color:var(--body-muted)' }, t('mobile.preview')),
          h('h3', { class: 'display-lg' }, m.device),
          h('p', { class: 'lead-airy muted' }, `${m.width} × ${m.height} pt · Safari`),
        ),
      );
    }
    case 'memory': {
      const m = d as SL.MemoryData;
      if (!m.samples?.length) return null;
      const vIcon = m.verdict === 'clean' ? 'pass' : m.verdict === 'suspicious' ? 'warn' : 'fail';
      return h('div', {},
        h('div', { class: 'stats' },
          stat(`${m.growthPct >= 0 ? '+' : ''}${m.growthPct.toFixed(1)}`, '%', t('mem.heap')),
          stat(fmtBytes(m.samples[m.samples.length - 1].heapUsed), '', 'JS heap'),
          stat(String(m.samples[m.samples.length - 1].nodes), '', t('mem.nodes')),
          stat(m.detachedNodes == null ? '—' : String(m.detachedNodes), '', 'Detached nodes'),
        ),
        h('p', { class: 'verdict' }, icon(vIcon, `status-icon ${vIcon}`), t(`mem.${m.verdict}` as Key)),
        h('div', { class: 'chart-card', style: 'margin-top:24px' }, h('h3', {}, t('mem.chart')), heapChart(m.samples)),
      );
    }
    case 'links':
      return h('div', { class: 'stats' }, stat(String(d.total), '', 'URLs'), stat(String(d.internal), '', 'Internal'), stat(String(d.external), '', 'External'), stat(String(d.checked), '', 'Checked'));
    case 'seo':
      return h('div', { class: 'stats' }, stat(String(d.words), '', 'Words'), stat(String(d.pagesCrawled), '', 'Pages crawled'), stat(d.lang || '—', '', 'Language'), stat(String(d.schemaTypes?.length ?? 0), '', 'Schema types'));
    case 'cloudflare':
      return h('div', { class: 'stats' },
        stat(d.onCloudflare ? 'Yes' : 'No', '', 'On Cloudflare'), stat(d.colo || '—', '', 'Edge location'),
        stat(d.fullSetup ? 'Full' : d.onCloudflare ? 'Partial' : '—', '', 'Setup'), stat(String(d.ips?.length ?? 0), '', 'IP addresses'));
    case 'website':
      return d.tls ? h('div', { class: 'stats' }, stat(String(d.tls.daysLeft), 'd', 'Certificate'), stat(d.tls.protocol?.replace('TLSv', 'TLS ') || '—', '', 'Protocol'), stat(...fmtMs(d.ttfbMs), 'TTFB'), stat(fmtBytes(d.htmlBytes), '', 'HTML')) : null;
    default:
      return null;
  }
}

function checkList(checks: SL.Check[], filter: Filter): HTMLElement {
  const shown = [...checks]
    .filter((c) => filter === 'all' || (filter === 'issues' ? c.status === 'fail' || c.status === 'warn' : c.status === 'pass'))
    .sort((a, b) => RANK[a.status] - RANK[b.status]);
  if (!shown.length) return h('div', { class: 'checks' }, h('div', { class: 'empty-filter' }, '—'));
  return h('ul', { class: 'checks' }, shown.map((c) => {
    const hasBody = (c.fix && c.status !== 'pass') || c.items.length > 0;
    const body = hasBody ? h('div', { class: 'body', hidden: true },
      c.fix && c.status !== 'pass' ? h('div', { class: 'fix' }, h('strong', {}, t('check.fix')), c.fix) : null,
      c.items.length ? h('ul', { class: 'items' }, c.items.slice(0, 100).map((i) => h('li', {}, i)), c.items.length > 100 ? h('li', {}, `+${c.items.length - 100} ${t('check.more')}`) : null) : null,
    ) : null;
    const btn = h('button', { type: 'button', ...(hasBody ? { 'aria-expanded': 'false' } : { disabled: true, style: 'cursor:default' }) },
      icon(c.status, `status-icon ${c.status}`),
      h('div', {}, h('div', { class: 'title' }, c.title), h('div', { class: 'detail' }, h('span', { class: 'sr-only' }, `${c.status}: `), c.detail)),
      hasBody ? icon('chevron', 'chev') : h('span'),
    );
    if (body) btn.addEventListener('click', () => {
      body.hidden = !body.hidden;
      btn.setAttribute('aria-expanded', String(!body.hidden));
    });
    return h('li', { class: 'check' }, btn, body);
  }));
}

// ---------- history ----------
function historyList(items: SL.HistoryItem[]): HTMLElement {
  return h('ul', { class: 'list' }, items.map((it) => {
    const open = h('button', { class: 'btn btn-secondary btn-small', type: 'button' }, t('history.open'));
    open.addEventListener('click', async () => {
      const rep = await api.loadHistory(it.id);
      if (rep) { state.report = rep; state.filters = {}; go('report'); }
    });
    const del = h('button', { class: 'text-link caption', type: 'button' }, t('history.delete'));
    del.addEventListener('click', async () => {
      await api.deleteHistory(it.id);
      state.history = await api.listHistory();
      render();
    });
    return h('li', {},
      ring(it.score, 48, 5),
      h('div', { class: 'grow' }, h('div', { class: 'host' }, host(it.url)), h('div', { class: 'caption muted' }, new Date(it.startedAt).toLocaleString())),
      del, open,
    );
  }));
}

function renderHistory(): void {
  $view.append(h('section', { class: 'tile tile-parchment', style: 'min-height:70vh' },
    h('div', { class: 'inner', style: 'max-width:820px' },
      h('h1', { class: 'hero-display', style: 'margin-bottom:40px' }, t('history.title')),
      state.history.length ? historyList(state.history) : h('p', { class: 'lead muted' }, t('history.empty')),
    ),
  ));
}

// ---------- settings ----------
function renderSettings(): void {
  const s = { ...state.settings! };
  const sel = (id: string, value: string, options: [string, string][]) => {
    const el = h('select', { id }, options.map(([v, l]) => h('option', { value: v }, l))) as HTMLSelectElement;
    el.value = value;
    return el;
  };
  const num = (id: string, value: number, min: number, max: number) => h('input', { id, type: 'number', min, max, value }) as HTMLInputElement;

  const lang = sel('set-lang', s.language, [['auto', 'Auto'], ...LANGUAGES.map((l) => [l.code, l.name] as [string, string])]);
  const theme = sel('set-theme', s.theme, [['system', t('settings.themeSystem')], ['light', t('settings.themeLight')], ['dark', t('settings.themeDark')]]);
  const reportTheme = sel('set-report', s.reportTheme ?? 'brand', [['brand', t('settings.reportBrand')], ['sightline', t('settings.reportPlain')]]);
  const device = sel('set-device', s.device, [['iphone', 'iPhone 16 Pro'], ['ipad', 'iPad Air 11"']]);
  const pages = num('set-pages', s.maxPages, 1, 500);
  const links = num('set-links', s.maxLinks, 10, 2000);
  const mem = num('set-mem', s.memoryIterations, 3, 30);
  const token = h('input', { id: 'set-token', type: 'password', autocomplete: 'off', spellcheck: 'false', value: s.cloudflareToken, placeholder: '••••••••' }) as HTMLInputElement;
  const lhForm = sel('set-lh', s.lighthouseFormFactor ?? 'mobile', [['mobile', t('settings.mobile')], ['desktop', t('settings.desktop')]]);

  // ---- memory test scenario editor ----
  const scenario: SL.MemoryScenario = JSON.parse(JSON.stringify(s.memoryScenario ?? { mode: 'auto', steps: [], includeAuto: true }));
  const memMode = sel('set-memmode', scenario.mode, [['auto', t('settings.memAuto')], ['custom', t('settings.memCustom')]]);
  const includeAuto = h('input', { type: 'checkbox', id: 'set-memauto' }) as HTMLInputElement;
  includeAuto.checked = scenario.includeAuto;
  const stepsBox = h('div', { class: 'steps-editor' });
  const ACTIONS: SL.ScenarioStep['action'][] = ['click', 'navigate', 'back', 'type', 'press', 'scroll', 'wait'];
  const PLACEHOLDER: Record<SL.ScenarioStep['action'], [string, string]> = {
    click: ['#menu-button', ''], navigate: ['', '/pricing'], back: ['', ''], type: ['#search', 'shoes'],
    press: ['', 'Escape'], scroll: ['', 'bottom'], wait: ['', '500'],
  };
  const drawSteps = () => {
    clear(stepsBox);
    scenario.steps.forEach((st, i) => {
      const act = h('select', { 'aria-label': `Step ${i + 1} action` }, ACTIONS.map((a) => h('option', { value: a }, a))) as HTMLSelectElement;
      act.value = st.action;
      const [phSel, phVal] = PLACEHOLDER[st.action];
      const selInput = h('input', { type: 'text', placeholder: phSel || '—', value: st.selector ?? '', 'aria-label': `Step ${i + 1} CSS selector`, disabled: !phSel }) as HTMLInputElement;
      const valInput = h('input', { type: 'text', placeholder: phVal || '—', value: st.value ?? '', 'aria-label': `Step ${i + 1} value`, disabled: !phVal }) as HTMLInputElement;
      const rm = h('button', { class: 'text-link caption', type: 'button' }, t('settings.remove'));
      const risk = stepRisk(st);
      act.addEventListener('change', () => { st.action = act.value as SL.ScenarioStep['action']; drawSteps(); });
      selInput.addEventListener('input', () => { st.selector = selInput.value; });
      valInput.addEventListener('input', () => { st.value = valInput.value; });
      selInput.addEventListener('change', drawSteps);
      valInput.addEventListener('change', drawSteps);
      rm.addEventListener('click', () => { scenario.steps.splice(i, 1); drawSteps(); });
      stepsBox.append(h('div', { class: 'step-row' }, h('span', { class: 'step-n' }, String(i + 1)), act, selInput, valInput, rm));
      if (risk) stepsBox.append(h('p', { class: 'step-risk' }, icon('warn', 'status-icon warn'), risk));
    });
    const add = h('button', { class: 'btn btn-secondary btn-small', type: 'button' }, `+ ${t('settings.addStep')}`);
    add.addEventListener('click', () => { scenario.steps.push({ action: 'click', selector: '' }); drawSteps(); });
    stepsBox.append(add);
  };
  drawSteps();
  const autoLabel = h('label', { class: 'inline-check', for: 'set-memauto' }, includeAuto, t('settings.memIncludeAuto'));
  const syncMode = () => { const custom = memMode.value === 'custom'; stepsBox.hidden = !custom; autoLabel.hidden = !custom; };
  memMode.addEventListener('change', syncMode);
  syncMode();

  // ---- sites the user allowed for interaction tests ----
  const consentList = h('ul', { class: 'consent-list' });
  const drawConsent = () => {
    clear(consentList);
    for (const site of state.settings!.memoryConsent) {
      const rm = h('button', { class: 'text-link caption', type: 'button' }, t('settings.revoke'));
      rm.addEventListener('click', async () => {
        state.settings = await api.setSettings({ memoryConsent: state.settings!.memoryConsent.filter((x) => x !== site) });
        drawConsent();
      });
      consentList.append(h('li', {}, h('span', {}, site), rm));
    }
    if (!state.settings!.memoryConsent.length) consentList.append(h('li', { class: 'muted' }, '—'));
  };
  drawConsent();

  const saved = h('span', { class: 'caption muted', 'aria-live': 'polite' });
  const save = h('button', { class: 'btn btn-primary', type: 'button' }, t('settings.save'));
  save.addEventListener('click', async () => {
    const clamp = (v: string, lo: number, hi: number, d: number) => Math.min(hi, Math.max(lo, Number(v) || d));
    state.settings = await api.setSettings({
      language: lang.value, theme: theme.value as SL.Settings['theme'], reportTheme: reportTheme.value as SL.Settings['reportTheme'], device: device.value as SL.Settings['device'],
      maxPages: clamp(pages.value, 1, 500, 15), maxLinks: clamp(links.value, 10, 2000, 150), memoryIterations: clamp(mem.value, 3, 30, 8),
      cloudflareToken: token.value.trim(),
      lighthouseFormFactor: lhForm.value as SL.Settings['lighthouseFormFactor'],
      memoryScenario: {
        mode: memMode.value as SL.MemoryScenario['mode'],
        includeAuto: includeAuto.checked,
        steps: scenario.steps.filter((st) => st.action === 'back' || st.selector?.trim() || st.value?.trim()),
      },
    });
    applyTheme();
    applyLanguage();
    render();
    const msg = document.querySelector('[aria-live].caption');
    if (msg) msg.textContent = t('settings.saved');
  });

  const row = (label: string, id: string, control: HTMLElement) => h('div', { class: 'row' }, h('label', { for: id }, label), control);
  $view.append(h('section', { class: 'tile tile-parchment', style: 'min-height:70vh' },
    h('div', { class: 'inner' },
      h('h1', { class: 'hero-display', style: 'margin-bottom:40px' }, t('settings.title')),
      h('div', { class: 'form' },
        h('div', { class: 'card', style: 'padding:0' },
          row(t('settings.language'), 'set-lang', lang),
          row(t('settings.theme'), 'set-theme', theme),
          row(t('settings.report'), 'set-report', reportTheme),
        ),
        // Audit tuning and the API token only apply to the desktop app (the website uses fixed, safe limits).
        isWeb() ? null : h('div', { class: 'card', style: 'padding:0;margin-top:20px' },
          row(t('settings.pages'), 'set-pages', pages),
          row(t('settings.links'), 'set-links', links),
          row(t('settings.memory'), 'set-mem', mem),
          row(t('settings.device'), 'set-device', device),
          row(t('settings.lhForm'), 'set-lh', lhForm),
        ),
        isWeb() ? null : h('div', { class: 'card', style: 'padding:0;margin-top:20px' },
          row(t('settings.memMode'), 'set-memmode', memMode),
          h('div', { class: 'row stack' },
            autoLabel,
            h('span', { class: 'caption muted' }, t('settings.memHelp')),
            stepsBox),
          h('div', { class: 'row stack' }, h('span', {}, t('settings.consented')), consentList),
        ),
        isWeb() ? null : h('div', { class: 'card', style: 'padding:0;margin-top:20px' },
          h('div', { class: 'row stack' }, h('label', { for: 'set-token' }, t('settings.cfToken')), token, h('span', { class: 'caption muted' }, t('settings.cfHelp'))),
        ),
        h('div', { class: 'form-actions' }, saved, save),
        aiCard(),
      ),
    ),
  ));
}

function aiCard(): HTMLElement {
  const cfg = state.info?.mcpConfig;
  if (!cfg) {
    return h('div', { class: 'card', style: 'margin-top:32px' },
      h('p', { class: 'tagline', style: 'margin-bottom:8px' }, t('settings.ai')),
      h('p', { class: 'caption muted' }, t('settings.aiHelp')),
      state.info?.downloadUrl ? h('a', { class: 'btn btn-primary btn-small', href: state.info.downloadUrl }, t('web.getApp')) : null,
    );
  }
  const copy = h('button', { class: 'btn btn-secondary btn-small', type: 'button' }, t('settings.copy'));
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(cfg); } catch {
      const ta = h('textarea', {}, cfg); document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
    copy.textContent = t('settings.copied');
    setTimeout(() => { copy.textContent = t('settings.copy'); }, 1800);
  });
  return h('div', { class: 'card', style: 'margin-top:32px' },
    h('div', { style: 'display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:8px' }, h('p', { class: 'tagline' }, t('settings.ai')), copy),
    h('p', { class: 'caption muted', style: 'margin:0 0 12px' }, t('settings.aiHelp')),
    h('div', { class: 'code-box' }, cfg),
    h('p', { class: 'fine muted', style: 'margin-top:10px' }, 'Cursor: Settings → MCP → Add server · VS Code: .vscode/mcp.json'),
  );
}

// ---------- boot ----------
async function boot(): Promise<void> {
  [state.settings, state.info, state.history] = await Promise.all([api.getSettings(), api.info(), api.listHistory()]);
  document.body.classList.add(`platform-${state.info.platform}`);
  if (state.info.web) {
    const nav = document.querySelector('.global-nav nav')!;
    nav.append(h('a', { href: '/#download', class: 'nav-link', 'data-i18n': 'nav.download', target: '_top' }, t('nav.download')));
  }
  document.getElementById('footer-version')!.textContent = `Sightline ${state.info.version} · ${state.info.platform}`;
  (document.getElementById('footer-lang') as HTMLSelectElement).addEventListener('change', async (e) => {
    state.settings = await api.setSettings({ language: (e.target as HTMLSelectElement).value });
    applyLanguage();
    render();
  });
  applyTheme();
  applyLanguage();
  const fromLink = new URLSearchParams(location.search).get('url');
  if (fromLink) {
    history.replaceState(null, '', location.pathname);
    void start(fromLink);
    return;
  }
  render();
}

void boot();
