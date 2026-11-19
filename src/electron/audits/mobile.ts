import { Probe } from '../probe';
import { check, category, fetchUrl, IOS_UA, IPADOS_UA } from '../../engine/util';

const DEVICES = {
  iphone: { name: 'iPhone 16 Pro', width: 402, height: 874, dpr: 3, ua: IOS_UA },
  ipad: { name: 'iPad Air 11"', width: 820, height: 1180, dpr: 2, ua: IPADOS_UA },
} as const;

interface MobileProbeResult {
  viewport: string;
  docWidth: number;
  winWidth: number;
  smallTargets: string[];
  targetsChecked: number;
  smallText: number;
  textChecked: number;
  zoomInputs: string[];
  wideImages: string[];
  usesSafeArea: boolean;
  uses100vh: boolean;
  fixedBgAttachment: boolean;
  intrusive: string[];
  autoplayNoInline: number;
  hoverOnlyMenus: number;
  touchIcons: { href: string; sizes: string }[];
  manifest: string | null;
  capable: string | null;
  mobileCapable: string | null;
  statusBar: string | null;
  appTitle: string | null;
  themeColor: string | null;
  itunesApp: string | null;
  formatDetection: string | null;
  flashOrPlugins: number;
}

const PROBE_SCRIPT = `(() => {
  const meta = (n) => document.querySelector('meta[name="' + n + '"]')?.getAttribute('content') ?? null;
  const vis = (el) => { const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0'; };
  const describe = (el) => (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + ' "' + (el.innerText || el.getAttribute('aria-label') || el.value || '').trim().slice(0, 40) + '"');

  const targets = [...document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role=button], [onclick]')];
  const small = []; let checked = 0;
  for (const el of targets) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || !vis(el)) continue;
    const cs = getComputedStyle(el);
    // Inline links inside running text are exempt (WCAG 2.5.8 exception)
    if (el.tagName === 'A' && cs.display === 'inline' && el.parentElement && /^(P|LI|SPAN|TD|DD|BLOCKQUOTE)$/.test(el.parentElement.tagName)) continue;
    checked++;
    if (Math.min(r.width, r.height) < 44 && r.width * r.height < 44 * 44) small.push(describe(el) + ' ' + Math.round(r.width) + '×' + Math.round(r.height));
  }

  let smallText = 0, textChecked = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (walker.nextNode()) {
    const t = walker.currentNode; const el = t.parentElement;
    if (!el || seen.has(el) || t.textContent.trim().length < 3) continue;
    seen.add(el);
    if (!vis(el)) continue;
    textChecked++;
    if (parseFloat(getComputedStyle(el).fontSize) < 12) smallText++;
  }

  const zoomInputs = [...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]), select, textarea')]
    .filter((el) => vis(el) && parseFloat(getComputedStyle(el).fontSize) < 16).map((el) => describe(el) + ' ' + getComputedStyle(el).fontSize);

  const wideImages = [...document.images].filter((img) => img.getBoundingClientRect().right > innerWidth + 2 && vis(img)).map((i) => i.currentSrc || i.src).slice(0, 20);

  let cssText = '';
  for (const sheet of document.styleSheets) { try { for (const r of sheet.cssRules) cssText += r.cssText; } catch (e) {} }
  document.querySelectorAll('[style]').forEach((el) => { cssText += el.getAttribute('style'); });

  const intrusive = [...document.querySelectorAll('body *')].filter((el) => {
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' || !vis(el)) return false;
    const r = el.getBoundingClientRect();
    return (r.width * Math.min(r.height, innerHeight)) / (innerWidth * innerHeight) > 0.3;
  }).slice(0, 5).map(describe);

  const autoplayNoInline = [...document.querySelectorAll('video[autoplay]')].filter((v) => !v.hasAttribute('playsinline') || !v.muted).length;

  return {
    viewport: meta('viewport') || '',
    docWidth: document.documentElement.scrollWidth, winWidth: innerWidth,
    smallTargets: small.slice(0, 40), targetsChecked: checked,
    smallText, textChecked, zoomInputs: zoomInputs.slice(0, 20), wideImages,
    usesSafeArea: /safe-area-inset/.test(cssText),
    uses100vh: /height:\\s*100vh/.test(cssText),
    fixedBgAttachment: /background-attachment:\\s*fixed/.test(cssText),
    intrusive, autoplayNoInline,
    hoverOnlyMenus: 0,
    touchIcons: [...document.querySelectorAll('link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]')].map((l) => ({ href: l.href, sizes: l.getAttribute('sizes') || '' })),
    manifest: document.querySelector('link[rel="manifest"]')?.href ?? null,
    capable: meta('apple-mobile-web-app-capable'), mobileCapable: meta('mobile-web-app-capable'),
    statusBar: meta('apple-mobile-web-app-status-bar-style'), appTitle: meta('apple-mobile-web-app-title'),
    themeColor: meta('theme-color'), itunesApp: meta('apple-itunes-app'), formatDetection: meta('format-detection'),
    flashOrPlugins: document.querySelectorAll('object, embed[type*="flash"], applet').length,
  };
})()`;

export async function auditMobile(url: string, deviceKey: 'iphone' | 'ipad'): Promise<SL.Category<SL.MobileData>> {
  const d = DEVICES[deviceKey];
  const probe = await Probe.create({ width: d.width, height: d.height, mobile: true, deviceScaleFactor: d.dpr, userAgent: d.ua });
  try {
    const nav = await probe.goto(url, 45000, 3000);
    const r = await probe.evaluate<MobileProbeResult>(PROBE_SCRIPT);
    const screenshot = await probe.screenshot(70);
    const checks: SL.Check[] = [];
    const origin = new URL(url).origin;

    if (!nav.loaded) checks.push(check('mob.load', 'Page load on device', 'warn', nav.error || 'Did not finish loading.'));

    // Viewport
    const vp = r.viewport.toLowerCase().replace(/\s/g, '');
    if (!vp) checks.push(check('mob.viewport', 'Viewport meta tag', 'fail', 'No <meta name="viewport">. Safari will render a zoomed-out 980px desktop layout.', { weight: 3, fix: '<meta name="viewport" content="width=device-width, initial-scale=1">' }));
    else if (!vp.includes('width=device-width')) checks.push(check('mob.viewport', 'Viewport meta tag', 'warn', `content="${r.viewport}" lacks width=device-width.`, { weight: 3 }));
    else checks.push(check('mob.viewport', 'Viewport meta tag', 'pass', r.viewport, { weight: 3 }));
    if (/user-scalable=(no|0)|maximum-scale=1(\.0)?(,|$)/.test(vp)) checks.push(check('mob.zoom', 'Pinch-to-zoom allowed', 'fail', 'Viewport disables zooming, which harms accessibility.', { weight: 1.5, fix: 'Remove user-scalable=no and maximum-scale=1.' }));
    else checks.push(check('mob.zoom', 'Pinch-to-zoom allowed', 'pass', 'Users can zoom.', { weight: 1.5 }));

    // Layout
    const overflow = r.docWidth - r.winWidth;
    checks.push(overflow > 2
      ? check('mob.overflow', 'No horizontal scrolling', 'fail', `Content is ${overflow}px wider than the ${r.winWidth}px screen.`, { weight: 3, items: r.wideImages, fix: 'Find the overflowing element (often fixed widths or wide images) and constrain with max-width: 100%.' })
      : check('mob.overflow', 'No horizontal scrolling', 'pass', `Content fits the ${r.winWidth}px viewport.`, { weight: 3 }));

    const smallPct = r.targetsChecked ? r.smallTargets.length / r.targetsChecked : 0;
    checks.push(r.smallTargets.length === 0
      ? check('mob.targets', 'Tap targets ≥ 44pt', 'pass', `${r.targetsChecked} interactive elements meet Apple's 44×44pt guideline.`, { weight: 2.5 })
      : check('mob.targets', 'Tap targets ≥ 44pt', smallPct > 0.25 ? 'fail' : 'warn', `${r.smallTargets.length} of ${r.targetsChecked} tap targets are smaller than 44×44pt.`, { weight: 2.5, items: r.smallTargets, fix: 'Apple HIG: give controls at least 44×44pt of hit area (padding counts).' }));

    const textPct = r.textChecked ? r.smallText / r.textChecked : 0;
    checks.push(textPct < 0.05
      ? check('mob.text', 'Legible font sizes', 'pass', `${Math.round((1 - textPct) * 100)}% of text is ≥ 12px.`, { weight: 1.5 })
      : check('mob.text', 'Legible font sizes', textPct > 0.25 ? 'fail' : 'warn', `${Math.round(textPct * 100)}% of text blocks are under 12px.`, { weight: 1.5 }));

    checks.push(r.zoomInputs.length
      ? check('mob.input-zoom', 'No auto-zoom on input focus', 'warn', `${r.zoomInputs.length} field(s) use a font smaller than 16px — iOS Safari zooms in when they are focused.`, { weight: 1.5, items: r.zoomInputs, fix: 'Set font-size: 16px (or larger) on inputs, selects and textareas.' })
      : check('mob.input-zoom', 'No auto-zoom on input focus', 'pass', 'Form fields are ≥ 16px, so iOS will not zoom on focus.', { weight: 1.5 }));

    checks.push(r.intrusive.length
      ? check('mob.interstitial', 'No intrusive overlays', 'warn', `${r.intrusive.length} fixed element(s) cover more than 30% of the screen.`, { items: r.intrusive, weight: 1.5 })
      : check('mob.interstitial', 'No intrusive overlays', 'pass', 'No full-screen popups on load.', { weight: 1.5 }));

    // iOS specifics
    const coverFit = vp.includes('viewport-fit=cover');
    if (coverFit && !r.usesSafeArea) checks.push(check('mob.safe-area', 'Safe-area insets', 'fail', 'viewport-fit=cover is set but CSS never uses env(safe-area-inset-*). Content can hide under the notch / Dynamic Island and home indicator.', { weight: 1.5 }));
    else if (coverFit) checks.push(check('mob.safe-area', 'Safe-area insets', 'pass', 'viewport-fit=cover with env(safe-area-inset-*) padding.', { weight: 1.5 }));
    else checks.push(check('mob.safe-area', 'Safe-area insets', 'info', 'Not edge-to-edge (no viewport-fit=cover); Safari letterboxes in landscape.', { fix: 'For an edge-to-edge look add viewport-fit=cover and pad with env(safe-area-inset-*).' }));

    if (r.uses100vh) checks.push(check('mob.100vh', 'Dynamic viewport units', 'warn', 'CSS uses height: 100vh, which is taller than the visible area in iOS Safari when the toolbar is shown.', { fix: 'Use 100dvh / 100svh (with 100vh as fallback).', weight: 0.5 }));
    if (r.fixedBgAttachment) checks.push(check('mob.bg-fixed', 'background-attachment: fixed', 'warn', 'iOS Safari ignores background-attachment: fixed; parallax backgrounds will scroll.', { weight: 0.5 }));
    if (r.autoplayNoInline) checks.push(check('mob.video', 'Inline autoplay video', 'warn', `${r.autoplayNoInline} autoplay video(s) lack muted + playsinline; iOS will not autoplay them inline.`, { weight: 1 }));
    if (r.flashOrPlugins) checks.push(check('mob.plugins', 'No plugins', 'fail', `${r.flashOrPlugins} <object>/<embed> plugin element(s); not supported on iOS.`));

    // Home screen / PWA
    let iconOk = false;
    let iconDetail = '';
    const iconCandidates = r.touchIcons.length ? r.touchIcons.map((i) => i.href) : [`${origin}/apple-touch-icon.png`];
    for (const href of iconCandidates.slice(0, 3)) {
      const ir = await fetchUrl(href, { readBody: false, timeout: 8000 });
      if (ir.status === 200 && /image/.test(ir.headers['content-type'] || '')) { iconOk = true; iconDetail = href; break; }
    }
    const has180 = r.touchIcons.some((i) => i.sizes.includes('180'));
    checks.push(iconOk
      ? check('mob.touch-icon', 'Apple touch icon', has180 || !r.touchIcons.length ? 'pass' : 'warn', `${iconDetail}${has180 ? ' (180×180)' : r.touchIcons.length ? ' — add a 180×180 size for modern iPhones' : ''}`, { weight: 1.5 })
      : check('mob.touch-icon', 'Apple touch icon', 'fail', 'No apple-touch-icon found. "Add to Home Screen" will use a blurry screenshot.', { weight: 1.5, fix: '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">' }));

    checks.push(r.themeColor
      ? check('mob.theme', 'theme-color', 'pass', `${r.themeColor} — tints Safari's toolbar.`, { weight: 0.5 })
      : check('mob.theme', 'theme-color', 'warn', 'No theme-color; Safari cannot match its toolbar to your brand.', { weight: 0.5 }));

    if (r.manifest) {
      const mr = await fetchUrl(r.manifest, { timeout: 8000 });
      let man: { name?: string; short_name?: string; icons?: unknown[]; display?: string; start_url?: string } | null = null;
      try { man = JSON.parse(mr.body); } catch { man = null; }
      const missing = man ? ['name', 'icons', 'display', 'start_url'].filter((k) => !(man as Record<string, unknown>)[k]) : [];
      checks.push(!man
        ? check('mob.manifest', 'Web app manifest', 'fail', `Manifest at ${r.manifest} is not valid JSON (HTTP ${mr.status}).`)
        : missing.length
          ? check('mob.manifest', 'Web app manifest', 'warn', `Manifest is missing: ${missing.join(', ')}.`)
          : check('mob.manifest', 'Web app manifest', 'pass', `${man.name || man.short_name} · display: ${man.display}. Enables Home Screen web apps and Web Push on iOS 16.4+.`));
    } else {
      checks.push(check('mob.manifest', 'Web app manifest', 'info', 'No manifest. Needed for installable Home Screen web apps and Web Push on iOS 16.4+.', { weight: 0.5 }));
    }
    if (r.capable === 'yes' || r.mobileCapable === 'yes') {
      checks.push(check('mob.standalone', 'Standalone mode', 'pass', `apple-mobile-web-app-capable · status bar: ${r.statusBar || 'default'} · title: ${r.appTitle || '(page title)'}`, { weight: 0.5 }));
    }

    // App ecosystem
    if (r.itunesApp) checks.push(check('mob.smart-banner', 'Smart App Banner', 'pass', `apple-itunes-app: ${r.itunesApp}`, { weight: 0.5 }));
    const aasa = await fetchUrl(`${origin}/.well-known/apple-app-site-association`, { timeout: 8000 });
    let aasaJson: { applinks?: unknown; webcredentials?: unknown; appclips?: unknown } | null = null;
    try { aasaJson = aasa.status === 200 ? JSON.parse(aasa.body) : null; } catch { aasaJson = null; }
    if (aasa.status === 200) {
      checks.push(aasaJson
        ? check('mob.aasa', 'Universal Links (AASA)', 'pass', `apple-app-site-association found: ${Object.keys(aasaJson).join(', ')}.`, { weight: 0.5 })
        : check('mob.aasa', 'Universal Links (AASA)', 'fail', 'apple-app-site-association exists but is not valid JSON — Universal Links will not work.', { weight: 1 }));
      const ct = aasa.headers['content-type'] || '';
      if (aasaJson && !/json/.test(ct)) checks.push(check('mob.aasa-type', 'AASA content type', 'warn', `Served as "${ct}". Apple expects application/json.`, { weight: 0.5 }));
    } else {
      checks.push(check('mob.aasa', 'Universal Links (AASA)', 'info', 'No /.well-known/apple-app-site-association. Only needed if you have an iOS app.'));
    }
    if (r.formatDetection) checks.push(check('mob.format', 'Format detection', 'info', `format-detection: ${r.formatDetection}`));

    return category<SL.MobileData>('mobile', checks, { device: d.name, width: d.width, height: d.height, screenshot });
  } finally {
    probe.close();
  }
}
