/**
 * Works out the audited site's visual identity (colour, fonts, logo, name)
 * so exported reports can be styled like the client's own website.
 */
import { fetchDataUrl, fetchUrl } from './util';
import { clean, type Page } from './page';

type RGB = [number, number, number];

export function parseColor(input: string | undefined | null): RGB | null {
  if (!input) return null;
  const s = input.trim().toLowerCase();
  let m = s.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/);
  if (m) {
    if (m[4] !== undefined && parseFloat(m[4]) === 0) return null; // fully transparent
    return [Number(m[1]), Number(m[2]), Number(m[3])].map((v) => Math.max(0, Math.min(255, Math.round(v)))) as RGB;
  }
  return null;
}

export const toHex = ([r, g, b]: RGB) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

function luminance([r, g, b]: RGB): number {
  const f = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function contrast(a: RGB, b: RGB): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
function saturation([r, g, b]: RGB): number {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  return max === 0 ? 0 : (max - min) / max;
}
/** A colour that reads as a brand colour rather than white/black/grey. */
export function isBrandish(c: RGB | null): c is RGB {
  return Boolean(c) && saturation(c!) > 0.25 && luminance(c!) > 0.02 && luminance(c!) < 0.9;
}

/** Darken until white text reaches 4.5:1, so headers stay readable. */
function readableOn(c: RGB): { bg: RGB; fg: string } {
  const white: RGB = [255, 255, 255];
  const black: RGB = [0, 0, 0];
  if (contrast(c, white) >= 4.5) return { bg: c, fg: '#ffffff' };
  if (contrast(c, black) >= 7) return { bg: c, fg: '#111111' };
  let bg = c;
  for (let i = 0; i < 20 && contrast(bg, white) < 4.5; i++) bg = bg.map((v) => Math.round(v * 0.9)) as RGB;
  return { bg, fg: '#ffffff' };
}

function cleanFont(f: string | undefined): string {
  if (!f) return '';
  // keep the first two families, drop generic/system noise, quote names with spaces
  return f.split(',').map((x) => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean).slice(0, 2)
    .map((x) => (/\s/.test(x) ? `"${x}"` : x)).join(', ');
}

/**
 * Brand hints without a browser: CSS custom properties (--brand, --primary…), the most common
 * saturated button/background colour, body/heading fonts and Google Fonts families.
 */
export async function staticHints(page: Page): Promise<SL.BrandHints & { svgLogo?: string }> {
  const { $, finalUrl } = page;
  let css = $('style').map((_, el) => $(el).text()).get().join('\n');
  const sheets = $('link[rel="stylesheet"][href]').map((_, el) => $(el).attr('href') || '').get()
    .map((h) => { try { return new URL(h, finalUrl).href; } catch { return ''; } })
    // Brand CSS often lives on a CDN host; skip well-known third-party libraries.
    .filter((h) => /^https?:/.test(h) && !/fonts\.googleapis|cdnjs|jsdelivr|unpkg|bootstrapcdn|fontawesome/i.test(h)).slice(0, 4);
  for (const s of sheets) {
    const r = await fetchUrl(s, { timeout: 8000, maxBytes: 800 * 1024 });
    if (r.status === 200) css += '\n' + r.body;
  }
  const out: SL.BrandHints & { svgLogo?: string } = {};

  // 1. Named brand variables
  const varRe = /--([\w-]*(?:brand|primary|accent|main-color|theme)[\w-]*)\s*:\s*(#[0-9a-f]{3,8}|rgba?\([^)]*\))/gi;
  for (const m of css.matchAll(varRe)) {
    const c = parseColor(m[2]);
    if (isBrandish(c)) { out.primary = toHex(c); break; }
  }
  // 2. Most frequent saturated background colour on buttons/links
  if (!out.primary) {
    const counts = new Map<string, number>();
    const ruleRe = /([^{}]*(?:btn|button|cta|primary)[^{}]*)\{([^}]*)\}/gi;
    for (const m of css.matchAll(ruleRe)) {
      for (const d of m[2].matchAll(/background(?:-color)?\s*:\s*(#[0-9a-f]{3,8}|rgba?\([^)]*\))/gi)) {
        const c = parseColor(d[1]);
        if (isBrandish(c)) counts.set(toHex(c), (counts.get(toHex(c)) ?? 0) + 1);
      }
    }
    out.primary = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  }
  // Fonts: Google Fonts link, then body / heading rules
  const gf = $('link[href*="fonts.googleapis.com"]').map((_, el) => $(el).attr('href') || '').get()
    .flatMap((h) => [...h.matchAll(/family=([^:&]+)/g)].map((m) => decodeURIComponent(m[1].replace(/\+/g, ' '))));
  const bodyFont = css.match(/(?:^|[},\s])(?:html|body)\s*\{[^}]*font-family\s*:\s*([^;}]+)/i)?.[1];
  const headFont = css.match(/(?:^|[},\s])h1[^{]*\{[^}]*font-family\s*:\s*([^;}]+)/i)?.[1];
  out.fontBody = bodyFont && !/var\(/.test(bodyFont) ? bodyFont : gf[0];
  out.fontHeading = headFont && !/var\(/.test(headFont) ? headFont : gf[1] ?? out.fontBody;
  // Inline SVG logo in the header
  const svg = $('header a svg, [class*="logo" i] svg, a[aria-label*="home" i] svg, a[href="/"] svg').first();
  if (svg.length) {
    const markup = $.html(svg);
    if (markup.length < 60000 && !/<script/i.test(markup)) {
      const withNs = markup.includes('xmlns=') ? markup : markup.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
      out.svgLogo = `data:image/svg+xml;base64,${Buffer.from(withNs).toString('base64')}`;
    }
  }
  return out;
}

/** Build the brand from static HTML plus optional live-page hints from the browser engine. */
export async function resolveBrand(page: Page, liveHints?: SL.BrandHints): Promise<SL.Brand> {
  const { $, finalUrl, headers } = page;
  const sh = await staticHints(page).catch(() => ({} as Awaited<ReturnType<typeof staticHints>>));
  // Live (computed) values win; static CSS analysis fills the gaps.
  const hints: SL.BrandHints = {
    primary: liveHints?.primary && isBrandish(parseColor(liveHints.primary)) ? liveHints.primary : sh.primary ?? liveHints?.primary,
    background: liveHints?.background, text: liveHints?.text,
    fontHeading: liveHints?.fontHeading || sh.fontHeading, fontBody: liveHints?.fontBody || sh.fontBody,
    logoUrl: liveHints?.logoUrl,
  };
  const meta = (sel: string) => clean($(sel).attr('content'));

  const name = meta('meta[property="og:site_name"]') || meta('meta[name="application-name"]') || meta('meta[name="apple-mobile-web-app-title"]')
    || clean($('title').first().text()).split(/\s[|–—-]\s/)[0] || new URL(finalUrl).hostname.replace(/^www\./, '');

  const metaColors = [meta('meta[name="theme-color"]'), meta('meta[name="msapplication-TileColor"]'), $('link[rel="mask-icon"]').attr('color')].map(parseColor);
  const hintColor = parseColor(hints?.primary);
  const brandColor = [hintColor, ...metaColors].find(isBrandish) ?? null;
  const source: SL.Brand['source'] = !brandColor ? 'default' : brandColor === hintColor ? 'computed' : 'meta';
  const { bg, fg } = readableOn(brandColor ?? [0x1d, 0x1d, 0x1f]);

  // Logo priority: header logo file → inline SVG logo → apple-touch-icon → favicon
  const abs = (u?: string) => { try { return u ? new URL(u, finalUrl).href : ''; } catch { return ''; } };
  const firstFetch = async (urls: (string | undefined)[]) => {
    for (const u of [...new Set(urls.map(abs).filter(Boolean))].slice(0, 3)) {
      const d = await fetchDataUrl(u);
      if (d) return d;
    }
    return undefined;
  };
  const logo =
    (await firstFetch([hints.logoUrl, $('header img[src*="logo" i], header img[alt*="logo" i], img[class*="logo" i], a[class*="logo" i] img, [class*="brand" i] img').first().attr('src')]))
    ?? sh.svgLogo
    ?? (await firstFetch([$('link[rel="apple-touch-icon"]').attr('href'), $('link[rel~="icon"][type="image/svg+xml"]').attr('href'), $('link[rel~="icon"]').last().attr('href')]));

  const xfo = (headers['x-frame-options'] || '').toLowerCase();
  const frameAnc = /frame-ancestors\s+([^;]+)/i.exec(headers['content-security-policy'] || '')?.[1] ?? '';
  const frameable = !xfo && (!frameAnc || /\*/.test(frameAnc));

  const bgHint = parseColor(hints?.background);
  const textHint = parseColor(hints?.text);
  return {
    name: name.slice(0, 60),
    primary: toHex(bg),
    onPrimary: fg,
    background: bgHint ? toHex(bgHint) : '#ffffff',
    text: textHint && bgHint && contrast(textHint, bgHint) >= 4.5 ? toHex(textHint) : '#1d1d1f',
    fontHeading: cleanFont(hints?.fontHeading),
    fontBody: cleanFont(hints?.fontBody),
    logo,
    source,
    frameable,
  };
}

/** Script evaluated in the live page to read computed brand styles. */
export const BRAND_PROBE = `(() => {
  const cs = (el) => el ? getComputedStyle(el) : null;
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 40 && r.height > 20 && r.top < innerHeight * 1.5; };
  const sat = (c) => { const m = c.match(/\\d+(\\.\\d+)?/g); if (!m) return 0; const [r,g,b,a] = m.map(Number); if (a === 0) return 0; const mx = Math.max(r,g,b), mn = Math.min(r,g,b); return mx ? (mx - mn) / mx : 0; };
  const ctas = [...document.querySelectorAll('a[class*="btn" i], a[class*="button" i], button, [role=button], input[type=submit]')]
    .filter(vis).map((el) => cs(el).backgroundColor).filter((c) => sat(c) > 0.25);
  const counts = {}; ctas.forEach((c) => counts[c] = (counts[c] || 0) + 1);
  let primary = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!primary) {
    const links = [...document.querySelectorAll('a[href]')].filter(vis).map((a) => cs(a).color).filter((c) => sat(c) > 0.3);
    primary = links[0];
  }
  const logo = [...document.querySelectorAll('header img, header svg, [class*="logo" i] img, img[alt*="logo" i], img[src*="logo" i]')]
    .find((el) => el.tagName === 'IMG' && vis(el) && el.getBoundingClientRect().top < 200);
  const body = cs(document.body);
  const h = document.querySelector('h1, h2');
  return {
    primary,
    background: body.backgroundColor,
    text: body.color,
    fontHeading: h ? cs(h).fontFamily : undefined,
    fontBody: body.fontFamily,
    logoUrl: logo ? (logo.currentSrc || logo.src) : undefined,
  };
})()`;
