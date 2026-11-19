import { h, s, fmtBytes } from './dom.js';
import { t } from './i18n.js';

export type Grade = 'good' | 'warn' | 'bad' | 'none';
export function grade(score: number | null): Grade {
  if (score == null) return 'none';
  return score >= 90 ? 'good' : score >= 50 ? 'warn' : 'bad';
}

/** Score ring — the number is always printed, so color never carries meaning alone. */
export function ring(score: number | null, size = 96, stroke = 7): SVGElement {
  const r = size / 2 - stroke;
  const c = 2 * Math.PI * r;
  const value = s('circle', {
    class: `value grade-${grade(score)}`, cx: size / 2, cy: size / 2, r, fill: 'none', 'stroke-width': stroke,
    'stroke-linecap': 'round', 'stroke-dasharray': `0 ${c}`, transform: `rotate(-90 ${size / 2} ${size / 2})`,
  });
  requestAnimationFrame(() => requestAnimationFrame(() => value.setAttribute('stroke-dasharray', `${(c * (score ?? 0)) / 100} ${c}`)));
  return s('svg', { class: 'ring', width: size, height: size, viewBox: `0 0 ${size} ${size}`, role: 'img', 'aria-label': `Score ${score ?? 'not available'} of 100` },
    s('circle', { class: 'track', cx: size / 2, cy: size / 2, r, fill: 'none', 'stroke-width': stroke }),
    value,
    s('text', { x: '50%', y: '50%', dy: '.35em', 'text-anchor': 'middle', 'font-size': size * 0.3 }, score == null ? '—' : String(score)),
  );
}

/** Single-series line chart of heap after GC, with crosshair tooltip and a table view. */
export function heapChart(samples: SL.MemorySample[]): HTMLElement {
  const W = 720, H = 240, L = 56, R = 16, T = 16, B = 32;
  const xs = samples.map((x) => x.iteration);
  const ys = samples.map((x) => x.heapUsed);
  const minY = Math.min(...ys) * 0.96;
  const maxY = Math.max(...ys) * 1.04 || 1;
  const xMax = Math.max(1, ...xs);
  const X = (i: number) => L + (i / xMax) * (W - L - R);
  const Y = (v: number) => T + (1 - (v - minY) / (maxY - minY || 1)) * (H - T - B);

  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': t('mem.chart') });
  for (let i = 0; i <= 4; i++) {
    const v = minY + ((maxY - minY) * i) / 4;
    svg.appendChild(s('line', { class: 'grid-line', x1: L, x2: W - R, y1: Y(v), y2: Y(v) }));
    svg.appendChild(s('text', { class: 'axis-label', x: L - 8, y: Y(v) + 4, 'text-anchor': 'end' }, fmtBytes(v)));
  }
  for (const x of xs) svg.appendChild(s('text', { class: 'axis-label', x: X(x), y: H - 10, 'text-anchor': 'middle' }, String(x)));
  const pts = samples.map((p) => `${X(p.iteration)},${Y(p.heapUsed)}`);
  svg.appendChild(s('path', { class: 'area', d: `M${X(xs[0])},${H - B} L${pts.join(' L')} L${X(xs[xs.length - 1])},${H - B} Z` }));
  svg.appendChild(s('path', { class: 'series', d: `M${pts.join(' L')}` }));
  const cross = s('line', { class: 'crosshair', x1: 0, x2: 0, y1: T, y2: H - B, opacity: 0 });
  svg.appendChild(cross);
  const markers = samples.map((p) => {
    const m = s('circle', { class: 'marker', cx: X(p.iteration), cy: Y(p.heapUsed), r: 4 });
    svg.appendChild(m);
    return m;
  });

  const tip = h('div', { class: 'tooltip', role: 'status' });
  const wrap = h('div', { class: 'chart' }, svg, tip);
  // Hit areas wider than the marks
  samples.forEach((p, i) => {
    const half = (W - L - R) / Math.max(1, samples.length - 1) / 2;
    const hit = s('rect', { class: 'hit', x: X(p.iteration) - half, y: T, width: half * 2, height: H - T - B });
    const show = () => {
      cross.setAttribute('x1', String(X(p.iteration))); cross.setAttribute('x2', String(X(p.iteration))); cross.setAttribute('opacity', '1');
      markers.forEach((m, j) => m.setAttribute('r', j === i ? '6' : '4'));
      tip.textContent = '';
      tip.append(h('strong', {}, `${t('mem.cycle')} ${p.iteration}`), h('br'), `${t('mem.heap')}: ${fmtBytes(p.heapUsed)}`, h('br'), `${t('mem.nodes')}: ${p.nodes}`, h('br'), `${t('mem.listeners')}: ${p.listeners}`);
      const box = svg.getBoundingClientRect();
      tip.style.left = `${(X(p.iteration) / W) * box.width}px`;
      tip.style.top = `${(Y(p.heapUsed) / H) * box.height}px`;
      tip.classList.add('show');
    };
    hit.addEventListener('mouseenter', show);
    hit.addEventListener('mouseleave', () => { tip.classList.remove('show'); cross.setAttribute('opacity', '0'); markers.forEach((m) => m.setAttribute('r', '4')); });
    svg.appendChild(hit);
  });

  const table = h('table', { class: 'data-table', hidden: true },
    h('thead', {}, h('tr', {}, h('th', {}, t('mem.cycle')), h('th', {}, t('mem.heap')), h('th', {}, t('mem.nodes')), h('th', {}, t('mem.listeners')))),
    h('tbody', {}, samples.map((p) => h('tr', {}, h('td', {}, String(p.iteration)), h('td', {}, fmtBytes(p.heapUsed)), h('td', {}, String(p.nodes)), h('td', {}, String(p.listeners))))),
  );
  const toggle = h('button', { class: 'text-link caption', type: 'button' }, t('table.show'));
  toggle.addEventListener('click', () => {
    table.hidden = !table.hidden;
    toggle.textContent = table.hidden ? t('table.show') : t('table.hide');
  });
  return h('div', {}, wrap, toggle, table);
}
