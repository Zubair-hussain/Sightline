/**
 * Standalone HTML report (also rendered to PDF). In "brand" mode it is styled with the
 * audited site's own colour, fonts and logo, so it reads like that company's own report.
 */
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const CATEGORY_NAMES: Record<SL.CategoryKey, string> = {
  seo: 'SEO', hreflang: 'Hreflang', links: 'Links', website: 'Website health', performance: 'Performance',
  cloudflare: 'Cloudflare & DNS', mobile: 'iPhone & iPad', memory: 'Memory leaks',
  lighthouse: 'Lighthouse', coverage: 'Code coverage', security: 'Cloudflare security',
};

const CATEGORY_DESC: Record<SL.CategoryKey, string> = {
  seo: 'Whether search engines can find, understand and rank the pages.',
  hreflang: 'Whether visitors are sent to the right language or country version.',
  links: 'Broken links, slow redirects and unsafe links on the page.',
  website: 'Security, encryption, response speed and accessibility basics.',
  performance: 'How fast the page loads and how stable it looks, measured in a real browser.',
  mobile: 'How the page works on iPhone and iPad Safari.',
  memory: 'Whether the page keeps consuming memory the longer it is used.',
  cloudflare: 'CDN, caching, TLS and DNS configuration.',
  lighthouse: 'Performance, Accessibility, Best Practices and SEO scores on a throttled device, scored like Lighthouse.',
  coverage: 'How much of the downloaded JavaScript and CSS the page actually uses.',
  security: 'What attackers can see and reach from outside: security headers, email spoofing, subdomain takeover, exposed origin servers and Cloudflare WAF protection.',
};

const ORDER: SL.CategoryKey[] = ['lighthouse', 'seo', 'performance', 'coverage', 'mobile', 'memory', 'website', 'links', 'hreflang', 'cloudflare', 'security'];
const RANK: Record<SL.Status, number> = { fail: 0, warn: 1, pass: 2, info: 3 };
const STATUS_LABEL: Record<SL.Status, string> = { pass: 'Passed', warn: 'Warning', fail: 'Failed', info: 'Info' };

export interface ReportOptions {
  /** 'brand' styles the report like the audited site; 'sightline' uses the neutral house style. */
  theme?: 'brand' | 'sightline';
  /** 'pdf' omits interactive parts (live iframe preview). */
  target?: 'html' | 'pdf';
}

const SYSTEM_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable", "Segoe UI", Inter, Roboto, "Noto Sans", sans-serif';

function gradeColor(score: number | null): string {
  if (score == null) return '#8e8e93';
  return score >= 90 ? '#1f9d55' : score >= 50 ? '#c77700' : '#d93025';
}
function gradeWord(score: number | null): string {
  if (score == null) return 'Not scored';
  return score >= 90 ? 'Good' : score >= 50 ? 'Needs work' : 'Poor';
}

function ring(score: number | null, size: number, opts: { track?: string; text?: string; stroke?: string } = {}): string {
  const sw = Math.max(5, size / 14);
  const r = size / 2 - sw;
  const c = 2 * Math.PI * r;
  const v = score ?? 0;
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Score ${score ?? 'n/a'} of 100">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${opts.track ?? '#e8e8ed'}" stroke-width="${sw}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${opts.stroke ?? gradeColor(score)}" stroke-width="${sw}" stroke-linecap="round"
      stroke-dasharray="${(c * v) / 100} ${c}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="50%" y="50%" dy=".35em" text-anchor="middle" font-size="${size * 0.32}" font-weight="700" fill="${opts.text ?? '#1d1d1f'}">${score ?? '—'}</text></svg>`;
}

const ICON: Record<SL.Status, string> = {
  pass: '<svg viewBox="0 0 24 24" class="ico"><circle cx="12" cy="12" r="10" fill="#1f9d55"/><path d="m7.5 12.3 3 3 6-6.3" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  warn: '<svg viewBox="0 0 24 24" class="ico"><path d="M12 2.8 22.4 20.6H1.6Z" fill="#e8a200" stroke="#e8a200" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 9v5" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="17.3" r="1.3" fill="#fff"/></svg>',
  fail: '<svg viewBox="0 0 24 24" class="ico"><rect x="2" y="2" width="20" height="20" rx="6" fill="#d93025"/><path d="m8 8 8 8M16 8l-8 8" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>',
  info: '<svg viewBox="0 0 24 24" class="ico"><circle cx="12" cy="12" r="10" fill="none" stroke="#8e8e93" stroke-width="2"/><path d="M12 11v6" stroke="#8e8e93" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="7.5" r="1.3" fill="#8e8e93"/></svg>',
};

export function renderHtmlReport(report: SL.Report, options: ReportOptions = {}): string {
  const theme = options.theme ?? 'brand';
  const target = options.target ?? 'html';
  const host = new URL(report.finalUrl).hostname;
  const b = report.meta.brand;
  const useBrand = theme === 'brand' && b && b.source !== 'default';
  const primary = useBrand ? b!.primary : '#1d1d1f';
  const onPrimary = useBrand ? b!.onPrimary : '#ffffff';
  // The brand colour doubles as text colour only when it is dark enough to read on white.
  const accent = useBrand ? (b!.onPrimary === '#ffffff' ? b!.primary : '#1d1d1f') : '#0066cc';
  const fontHeading = useBrand && b!.fontHeading ? `${b!.fontHeading}, ${SYSTEM_FONT}` : SYSTEM_FONT;
  const fontBody = useBrand && b!.fontBody ? `${b!.fontBody}, ${SYSTEM_FONT}` : SYSTEM_FONT;
  const siteName = (theme === 'brand' && b?.name) || report.meta.title || host;
  const logo = theme === 'brand' ? b?.logo : undefined;
  const date = new Date(report.startedAt);

  const cats = ORDER.map((k) => report.categories[k]).filter(Boolean) as SL.Category[];
  const totals = cats.reduce((a, c) => ({ pass: a.pass + c.summary.pass, warn: a.warn + c.summary.warn, fail: a.fail + c.summary.fail }), { pass: 0, warn: 0, fail: 0 });

  const priorities = cats.flatMap((c) => c.checks.filter((x) => x.status === 'fail').map((x) => ({ c, x })))
    .sort((p, q) => q.x.weight - p.x.weight).slice(0, 8);

  const perf = report.categories.performance?.data as SL.PerformanceData | undefined;
  const mob = report.categories.mobile?.data as SL.MobileData | undefined;
  const desktopShot = perf?.screenshot;
  const mobileShot = mob?.screenshot;
  const canFrame = target === 'html' && b?.frameable && /^https?:\/\//.test(report.finalUrl);

  // ---- sections ----
  const cover = `
  <section class="cover">
    <div class="cover-top">
      ${logo ? `<div class="logo-chip"><img src="${esc(logo)}" alt="${esc(siteName)} logo"></div>` : `<div class="logo-chip text">${esc(siteName.slice(0, 2).toUpperCase())}</div>`}
      <div class="cover-kicker">Website audit report</div>
    </div>
    <div class="cover-main">
      <h1>${esc(siteName)}</h1>
      <p class="cover-url">${esc(report.finalUrl)}</p>
      <div class="cover-score">
        ${ring(report.score, 210, { track: 'rgba(255,255,255,0.22)', text: onPrimary, stroke: onPrimary })}
        <div>
          <div class="cover-grade">${gradeWord(report.score)}</div>
          <div class="cover-counts">${totals.fail} issues to fix · ${totals.warn} warnings · ${totals.pass} checks passed</div>
          <div class="cover-counts">${cats.length} areas audited on ${esc(date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }))}</div>
        </div>
      </div>
    </div>
    <div class="cover-foot">Prepared with Sightline · ${esc(date.toLocaleString())}</div>
  </section>`;

  const summary = `
  <section class="page summary">
    <h2>Summary</h2>
    <p class="lead">An overall score of <strong>${report.score ?? 'n/a'}/100</strong> across ${cats.length} areas. Each area is scored from 0 to 100; green is good (90+), amber needs work (50–89), red is poor.</p>
    <div class="tiles">
      ${cats.map((c) => `<div class="tile">${ring(c.score, 76)}<div class="tile-name">${esc(CATEGORY_NAMES[c.key])}</div><div class="tile-sub">${c.summary.fail} failed · ${c.summary.warn} warnings</div></div>`).join('')}
    </div>
    ${priorities.length ? `<h3>Fix these first</h3>
    <ol class="priorities">${priorities.map(({ c, x }) => `<li><span class="pill">${esc(CATEGORY_NAMES[c.key])}</span> <strong>${esc(x.title)}</strong> — ${esc(x.detail)}${x.fix ? `<div class="fix">${esc(x.fix)}</div>` : ''}</li>`).join('')}</ol>` : '<h3>No failed checks</h3><p>Nothing critical was found.</p>'}
  </section>`;

  const preview = desktopShot || mobileShot || canFrame ? `
  <section class="page preview">
    <h2>How the site looks</h2>
    <div class="shots">
      ${desktopShot ? `<figure class="desktop"><div class="bar"><i></i><i></i><i></i><span>${esc(host)}</span></div><img src="${esc(desktopShot)}" alt="Desktop screenshot"><figcaption>Desktop · 1350 px</figcaption></figure>` : ''}
      ${mobileShot ? `<figure class="phone"><div class="phone-frame"><div class="island"></div><img src="${esc(mobileShot)}" alt="${esc(mob?.device)} screenshot"></div><figcaption>${esc(mob?.device)}</figcaption></figure>` : ''}
    </div>
    ${canFrame ? `<details class="live" open><summary>Live preview</summary>
      <iframe src="${esc(report.finalUrl)}" title="Live preview of ${esc(host)}" loading="lazy" sandbox="allow-scripts allow-forms" referrerpolicy="no-referrer"></iframe>
      <p class="muted">The live page as it is now. If it stays blank, the site blocks embedding.</p></details>` : ''}
  </section>` : '';

  const sections = cats.map((c) => {
    const rows = [...c.checks].sort((a, z) => RANK[a.status] - RANK[z.status]).map((ch) => `
      <tr class="${ch.status}">
        <td class="st">${ICON[ch.status]}<span class="sr">${STATUS_LABEL[ch.status]}</span></td>
        <td><div class="t">${esc(ch.title)}</div><div class="d">${esc(ch.detail)}</div>
          ${ch.fix && ch.status !== 'pass' ? `<div class="fix"><b>How to fix:</b> ${esc(ch.fix)}</div>` : ''}
          ${ch.items.length ? `<ul>${ch.items.slice(0, 12).map((i) => `<li>${esc(i)}</li>`).join('')}${ch.items.length > 12 ? `<li>… and ${ch.items.length - 12} more</li>` : ''}</ul>` : ''}
        </td></tr>`).join('');
    const mem = c.key === 'memory' ? memoryFigure(c.data as unknown as SL.MemoryData) : '';
    const lh = c.key === 'lighthouse' ? lighthouseGauges(c.data as unknown as SL.LighthouseData) : '';
    const cov = c.key === 'coverage' ? coverageSection(c.data as unknown as SL.CoverageData) : '';
    const vitals = c.key === 'performance' && perf ? `<div class="vitals">${[
      ['LCP', perf.lcp == null ? '—' : `${(perf.lcp / 1000).toFixed(2)} s`],
      ['FCP', perf.fcp == null ? '—' : `${(perf.fcp / 1000).toFixed(2)} s`],
      ['CLS', perf.cls == null ? '—' : perf.cls.toFixed(3)],
      ['TBT', perf.tbt == null ? '—' : `${Math.round(perf.tbt)} ms`],
      ['Requests', String(perf.requests)],
      ['Weight', `${(perf.transferBytes / 1048576).toFixed(1)} MB`],
    ].map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join('')}</div>` : '';
    return `<section class="page cat">
      <div class="cat-head">${ring(c.score, 80)}<div><h2>${esc(CATEGORY_NAMES[c.key])}</h2><p class="muted">${esc(CATEGORY_DESC[c.key])}</p>
      <p class="counts">${c.summary.fail} failed · ${c.summary.warn} warnings · ${c.summary.pass} passed</p></div></div>
      ${lh}${vitals}${cov}${mem}
      <table>${rows}</table></section>`;
  }).join('');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(siteName)} — Website audit report</title>
<style>
  :root { --brand:${primary}; --on-brand:${onPrimary}; --accent:${accent}; --ink:#1d1d1f; --muted:#6e6e73; --hair:#e5e5ea; --soft:#f5f5f7; }
  @page { size: A4; margin: 14mm 0; }
  @page :first { margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin:0; font-family:${fontBody}; color:var(--ink); background:#fff; font-size:13px; line-height:1.5; }
  h1, h2, h3 { font-family:${fontHeading}; letter-spacing:-0.02em; }
  .muted { color:var(--muted); }
  .sr { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); }

  .cover { min-height:100vh; height:297mm; background:var(--brand); color:var(--on-brand); padding:56px 56px 40px; display:flex; flex-direction:column; break-after:page; position:relative; overflow:hidden; }
  .cover::after { content:""; position:absolute; right:-160px; bottom:-160px; width:520px; height:520px; border-radius:50%; background:rgba(255,255,255,0.07); }
  .cover-top { display:flex; align-items:center; gap:16px; }
  .logo-chip { width:72px; height:72px; border-radius:18px; background:#fff; display:flex; align-items:center; justify-content:center; padding:10px; box-shadow:0 6px 24px rgba(0,0,0,0.18); }
  .logo-chip img { max-width:100%; max-height:100%; object-fit:contain; }
  .logo-chip.text { font-family:${fontHeading}; font-weight:700; font-size:26px; color:var(--brand); }
  .cover-kicker { font-size:15px; font-weight:600; text-transform:uppercase; letter-spacing:0.12em; opacity:0.85; }
  .cover-main { margin-top:auto; margin-bottom:auto; position:relative; z-index:1; }
  .cover h1 { font-size:56px; line-height:1.05; margin:0 0 10px; font-weight:700; }
  .cover-url { font-size:16px; opacity:0.85; margin:0 0 44px; word-break:break-all; }
  .cover-score { display:flex; align-items:center; gap:36px; }
  .cover-grade { font-family:${fontHeading}; font-size:34px; font-weight:700; margin-bottom:6px; }
  .cover-counts { font-size:15px; opacity:0.9; }
  .cover-foot { font-size:12px; opacity:0.75; position:relative; z-index:1; }

  .page { padding:40px 56px; break-inside:auto; }
  .page + .page { border-top:1px solid var(--hair); }
  h2 { font-size:28px; margin:0 0 8px; }
  h3 { font-size:18px; margin:28px 0 10px; }
  .lead { font-size:15px; max-width:640px; }
  .tiles { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-top:20px; }
  .tile { border:1px solid var(--hair); border-radius:16px; padding:16px 10px; text-align:center; break-inside:avoid; }
  .tile-name { font-weight:600; margin-top:6px; }
  .tile-sub { font-size:11px; color:var(--muted); }
  .priorities { padding-left:20px; }
  .priorities li { margin:0 0 10px; break-inside:avoid; }
  .pill { display:inline-block; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:var(--on-brand); background:var(--brand); border-radius:999px; padding:2px 8px; vertical-align:1px; }
  .fix { color:var(--accent); margin-top:3px; }
  .fix b { color:var(--ink); }

  .shots { display:flex; gap:28px; align-items:flex-end; margin-top:16px; break-inside:avoid; }
  .shots figure { margin:0; }
  .shots figcaption { text-align:center; font-size:11px; color:var(--muted); margin-top:8px; }
  .desktop { flex:1; border:1px solid var(--hair); border-radius:10px; overflow:hidden; box-shadow:rgba(0,0,0,0.18) 3px 5px 24px; }
  .desktop .bar { height:24px; background:var(--soft); display:flex; align-items:center; gap:5px; padding:0 10px; font-size:10px; color:var(--muted); }
  .desktop .bar i { width:8px; height:8px; border-radius:50%; background:#d1d1d6; }
  .desktop .bar span { margin-left:10px; }
  .desktop img { display:block; width:100%; }
  .desktop figcaption { padding-bottom:6px; }
  .phone { width:190px; flex:none; }
  .phone-frame { background:#1d1d1f; border-radius:30px; padding:7px; box-shadow:rgba(0,0,0,0.22) 3px 5px 24px; }
  .phone-frame .island { height:18px; display:flex; justify-content:center; background:#000; border-radius:24px 24px 0 0; }
  .phone-frame .island::after { content:""; width:56px; height:12px; margin-top:3px; background:#1d1d1f; border-radius:8px; }
  .phone-frame img { display:block; width:100%; border-radius:0 0 24px 24px; }
  .live { margin-top:24px; }
  .live summary { cursor:pointer; font-weight:600; color:var(--accent); }
  .live iframe { width:100%; height:640px; border:1px solid var(--hair); border-radius:10px; margin-top:10px; background:#fff; }

  .cat-head { display:flex; align-items:center; gap:18px; margin-bottom:14px; padding-left:14px; border-left:5px solid var(--brand); break-after:avoid; }
  .cat-head p { margin:2px 0; }
  .counts { font-size:12px; color:var(--muted); }
  .vitals { display:grid; grid-template-columns:repeat(6,1fr); gap:8px; margin:6px 0 14px; }
  .vitals div { background:var(--soft); border-radius:12px; padding:10px; text-align:center; }
  .vitals b { display:block; font-family:${fontHeading}; font-size:18px; }
  .vitals span { font-size:11px; color:var(--muted); }
  table { width:100%; border-collapse:collapse; }
  td { padding:10px 6px; border-top:1px solid var(--hair); vertical-align:top; }
  tr { break-inside:avoid; }
  td.st { width:30px; }
  .ico { width:18px; height:18px; display:block; margin-top:1px; }
  .t { font-weight:600; }
  .d { color:#3a3a3c; }
  ul { margin:6px 0 0; padding-left:16px; color:#555; font-size:11px; word-break:break-all; }
  .lh-gauges { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin:6px 0 16px; text-align:center; break-inside:avoid; }
  .lh-gauges div { font-weight:600; font-size:12px; }
  .lh-cond { font-size:11px; color:var(--muted); margin:-6px 0 14px; }
  .cov { width:100%; font-size:11px; margin:0 0 14px; }
  .cov th { text-align:left; color:var(--muted); font-weight:600; padding:6px; border-top:1px solid var(--hair); }
  .cov td { padding:6px; word-break:break-all; }
  .covbar { height:6px; border-radius:3px; background:var(--soft); position:relative; min-width:80px; }
  .covbar i { position:absolute; left:0; top:0; bottom:0; border-radius:3px; background:#d93025; }
  .cov-cards { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin:6px 0 14px; break-inside:avoid; }
  .cov-cards div { background:var(--soft); border-radius:12px; padding:10px; }
  .cov-cards b { display:block; font-family:${fontHeading}; font-size:18px; }
  .cov-cards span { font-size:11px; color:var(--muted); }
  .cov-split { margin:0 0 14px; break-inside:avoid; }
  .cov-split .row { display:grid; grid-template-columns:110px 1fr 150px; gap:10px; align-items:center; font-size:11px; margin:5px 0; }
  .cov-split .bar { height:12px; border-radius:6px; background:#1f9d55; display:flex; overflow:hidden; }
  .cov-split .bar i { background:#d93025; display:block; height:100%; }
  .cov-split .bar.party { background:var(--accent); }
  .cov-split .bar.party i { background:#8e8e93; }
  .cov-legend { font-size:10px; color:var(--muted); margin:2px 0 0; }
  .cov-legend i { display:inline-block; width:8px; height:8px; border-radius:2px; margin:0 4px 0 10px; vertical-align:0; }
  .cov-wins { margin:0 0 14px; padding-left:18px; font-size:12px; break-inside:avoid; }
  .cov-wins li { margin:3px 0; word-break:break-all; }
  .cov .tag, .cov-wins .tag { font-size:9px; font-weight:700; text-transform:uppercase; color:var(--muted); border:1px solid var(--hair); border-radius:4px; padding:0 4px; margin-left:4px; }
  .tp td { font-size:11px; }
  .tp .st-pass { color:#1f9d55; font-weight:700; } .tp .st-fail { color:#d93025; font-weight:700; } .tp .st-not-run { color:var(--muted); } .tp .st-blocked { color:#c77700; font-weight:700; }
  .memfig { border:1px solid var(--hair); border-radius:12px; padding:12px; margin:6px 0 14px; break-inside:avoid; }
  .memfig .cap { font-size:11px; color:var(--muted); margin-bottom:4px; }
  footer { padding:24px 56px 40px; font-size:11px; color:var(--muted); }
  @media screen { .cover { height:auto; min-height:640px; } body { max-width:1000px; margin:0 auto; box-shadow:0 0 0 1px var(--hair); } }
  @media (max-width: 700px) { .tiles { grid-template-columns:repeat(2,1fr); } .page, .cover { padding:28px 20px; } .shots { flex-direction:column; align-items:center; } .vitals { grid-template-columns:repeat(3,1fr); } .cover h1 { font-size:38px; } .cov-cards { grid-template-columns:repeat(2,1fr); } .cov-split .row { grid-template-columns:80px 1fr; } .cov-split .row > span:last-child { grid-column:1 / -1; color:var(--muted); } }
</style></head><body>
${cover}
${summary}
${preview}
${sections}
${testPlan(report)}
<footer>Report generated by Sightline ${esc(report.version)} for ${esc(host)}. Scores are heuristics; verify critical findings before acting on them.</footer>
</body></html>`;
}

/** Small inline SVG chart of heap usage per cycle (keeps the PDF self-contained). */
function memoryFigure(m: SL.MemoryData | undefined): string {
  if (!m?.samples?.length) return '';
  const W = 640, H = 150, L = 50, R = 10, T = 10, B = 22;
  const ys = m.samples.map((s) => s.heapUsed);
  const min = Math.min(...ys) * 0.97;
  const max = Math.max(...ys) * 1.03 || 1;
  const n = Math.max(1, m.samples.length - 1);
  const X = (i: number) => L + (i / n) * (W - L - R);
  const Y = (v: number) => T + (1 - (v - min) / (max - min || 1)) * (H - T - B);
  const pts = m.samples.map((s, i) => `${X(i).toFixed(1)},${Y(s.heapUsed).toFixed(1)}`);
  const mb = (v: number) => `${(v / 1048576).toFixed(1)} MB`;
  const grid = [0, 0.5, 1].map((f) => { const v = min + (max - min) * f; return `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="#e5e5ea"/><text x="${L - 6}" y="${Y(v) + 3}" font-size="9" text-anchor="end" fill="#6e6e73">${mb(v)}</text>`; }).join('');
  const verdict = m.verdict === 'clean' ? 'No leak detected' : m.verdict === 'suspicious' ? 'Possible leak' : 'Memory is leaking';
  return `<div class="memfig"><div class="cap">JS heap after garbage collection, per test cycle — ${verdict} (${m.growthPct >= 0 ? '+' : ''}${m.growthPct.toFixed(1)}%)</div>
    <svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Heap usage chart">${grid}
      <polyline points="${pts.join(' ')}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>
      ${m.samples.map((s, i) => `<circle cx="${X(i)}" cy="${Y(s.heapUsed)}" r="3" fill="var(--accent)"/><text x="${X(i)}" y="${H - 6}" font-size="9" text-anchor="middle" fill="#6e6e73">${s.iteration}</text>`).join('')}
    </svg></div>`;
}

function lighthouseGauges(d: SL.LighthouseData | undefined): string {
  if (!d?.scores) return '';
  const g = [['Performance', d.scores.performance], ['Accessibility', d.scores.accessibility], ['Best Practices', d.scores.bestPractices], ['SEO', d.scores.seo]] as const;
  return `<div class="lh-gauges">${g.map(([n, v]) => `<div>${ring(v, 84)}<br>${n}</div>`).join('')}</div>
    <p class="lh-cond">${esc(d.throttling)}</p>`;
}

/**
 * Code coverage for the PDF/HTML report: totals, used vs unused bars per file type, first- vs
 * third-party waste, the biggest single wins, and the file list. Everything is inline HTML/CSS so
 * the PDF stays self-contained.
 */
export function coverageSection(d: SL.CoverageData | undefined): string {
  if (!d?.files?.length) return '';
  const size = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);
  const pct = (unused: number, total: number) => (total ? Math.round((unused / total) * 100) : 0);
  const total = d.js.total + d.css.total;
  const unused = d.js.unused + d.css.unused;
  const third = d.files.filter((f) => !f.firstParty);
  const thirdUnused = third.reduce((a, f) => a + f.unused, 0);
  const firstUnused = unused - thirdUnused;

  const cards = `<div class="cov-cards">
    <div><b>${size(d.js.unused)}</b><span>Unused JavaScript · ${pct(d.js.unused, d.js.total)}% of ${size(d.js.total)}</span></div>
    <div><b>${size(d.css.unused)}</b><span>Unused CSS · ${pct(d.css.unused, d.css.total)}% of ${size(d.css.total)}</span></div>
    <div><b>${size(unused)}</b><span>Could be removed · ${pct(unused, total)}% of all JS + CSS</span></div>
    <div><b>${d.files.length}</b><span>Files measured · ${third.length} third-party</span></div>
  </div>`;

  const bar = (label: string, u: number, t: number, cls = '') =>
    `<div class="row"><span>${esc(label)}</span><div class="bar ${cls}" role="img" aria-label="${esc(label)}: ${pct(u, t)}%"><i style="width:${pct(u, t)}%"></i></div><span>${size(u)} of ${size(t)} (${pct(u, t)}%)</span></div>`;
  const split = `<div class="cov-split">
    ${bar('JavaScript', d.js.unused, d.js.total)}
    ${bar('CSS', d.css.unused, d.css.total)}
    <p class="cov-legend"><i style="background:#1f9d55"></i>Used<i style="background:#d93025"></i>Unused</p>
    ${unused ? `${bar('Unused, by owner', thirdUnused, unused, 'party')}
    <p class="cov-legend"><i style="background:var(--accent)"></i>Your own files ${size(firstUnused)}<i style="background:#8e8e93"></i>Third-party ${size(thirdUnused)}</p>` : ''}
  </div>`;

  const name = (url: string) => (url.length > 90 ? '…' + url.slice(-88) : url);
  const wins = d.files.filter((f) => f.unused > 0).slice(0, 5);
  const winList = wins.length ? `<h3>Biggest wins</h3><ol class="cov-wins">${wins.map((f) =>
    `<li><strong>Save ${size(f.unused)}</strong> in ${esc(name(f.url))}${f.firstParty ? '' : ' <span class="tag">3rd-party</span>'}</li>`).join('')}</ol>` : '';

  const LIMIT = 25;
  const rows = d.files.slice(0, LIMIT).map((f) => `<tr><td>${f.type.toUpperCase()}</td><td>${esc(name(f.url))}${f.firstParty ? '' : '<span class="tag">3rd-party</span>'}</td><td>${size(f.total)}</td><td>${size(f.unused)}</td><td><div class="covbar"><i style="width:${f.pct}%"></i></div> ${f.pct}%</td></tr>`).join('');
  const more = d.files.length > LIMIT ? `<tr><td colspan="5" class="muted">… and ${d.files.length - LIMIT} more file(s) with less unused code.</td></tr>` : '';
  return `${cards}${split}${winList}<h3>Every file</h3><table class="cov"><tr><th>Type</th><th>File</th><th>Size</th><th>Unused</th><th>Unused share</th></tr>${rows}${more}</table>`;
}

function testPlan(report: SL.Report): string {
  const cases = report.testCases ?? [];
  if (!cases.length) return '';
  const n = (s: SL.TestStatus) => cases.filter((c) => c.status === s).length;
  const label: Record<SL.TestStatus, string> = { pass: 'Pass', fail: 'Fail', blocked: 'Blocked', 'not-run': 'To do' };
  return `<section class="page tp">
    <h2>Launch-day test plan</h2>
    <p class="muted">${cases.length} test cases · ${n('pass')} passed · ${n('fail')} failed · ${n('not-run')} to do. Automated cases were checked by this audit; manual cases need a person.</p>
    <table><tr><th>ID</th><th>Test case</th><th>Priority</th><th>Type</th><th>Status</th></tr>
    ${cases.map((c) => `<tr><td>${esc(c.id)}</td><td><div class="t">${esc(c.title)}</div><div class="d">${esc(c.expected)}</div></td><td>${c.priority}</td><td>${c.type}</td><td class="st-${c.status}">${label[c.status]}</td></tr>`).join('')}
    </table></section>`;
}
