/**
 * Lighthouse-style performance scoring: log-normal curves with the control points
 * and metric weights Google publishes for Lighthouse 10–12.
 */

export type Metric = 'fcp' | 'si' | 'lcp' | 'tbt' | 'cls';

/** p10 = value scoring 0.9, median = value scoring 0.5 */
export const CURVES: Record<'mobile' | 'desktop', Record<Metric, { p10: number; median: number }>> = {
  mobile: {
    fcp: { p10: 1800, median: 3000 },
    si: { p10: 3387, median: 5800 },
    lcp: { p10: 2500, median: 4000 },
    tbt: { p10: 200, median: 600 },
    cls: { p10: 0.1, median: 0.25 },
  },
  desktop: {
    fcp: { p10: 934, median: 1600 },
    si: { p10: 1311, median: 2300 },
    lcp: { p10: 1200, median: 2400 },
    tbt: { p10: 150, median: 350 },
    cls: { p10: 0.1, median: 0.25 },
  },
};

export const WEIGHTS: Record<Metric, number> = { fcp: 0.1, si: 0.1, lcp: 0.25, tbt: 0.3, cls: 0.25 };

function erf(x: number): number {
  const sign = Math.sign(x);
  x = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = t * (a1 + t * (a2 + t * (a3 + t * (a4 + t * a5))));
  return sign * (1 - y * Math.exp(-x * x));
}

/** Score 0–1 for a metric value. */
export function logNormalScore({ p10, median }: { p10: number; median: number }, value: number): number {
  if (value <= 0) return 1;
  const INVERSE_ERFC_ONE_FIFTH = 0.9061938024368232;
  const xLogRatio = Math.log(Math.max(Number.MIN_VALUE, value / median));
  const p10LogRatio = -Math.log(Math.max(Number.MIN_VALUE, p10 / median));
  const standardizedX = (xLogRatio * INVERSE_ERFC_ONE_FIFTH) / p10LogRatio;
  const score = (1 - erf(standardizedX)) / 2;
  // Lighthouse clamps to [0, 1] and treats near-perfect as 1
  return Math.min(1, Math.max(0, score > 0.9999 ? 1 : score));
}

/** Weighted performance score 0–100; metrics that could not be measured are left out and weights renormalised. */
export function performanceScore(formFactor: 'mobile' | 'desktop', values: Partial<Record<Metric, number | null>>) {
  const metricScores: Record<string, number | null> = {};
  let total = 0;
  let wsum = 0;
  for (const m of Object.keys(WEIGHTS) as Metric[]) {
    const v = values[m];
    if (v == null || Number.isNaN(v)) { metricScores[m] = null; continue; }
    const s = logNormalScore(CURVES[formFactor][m], v);
    metricScores[m] = Math.round(s * 100);
    total += s * WEIGHTS[m];
    wsum += WEIGHTS[m];
  }
  return { score: wsum ? Math.round((total / wsum) * 100) : null, metricScores };
}

/** Lighthouse's own score bands. */
export function band(score: number | null): 'good' | 'average' | 'poor' | 'n/a' {
  if (score == null) return 'n/a';
  return score >= 90 ? 'good' : score >= 50 ? 'average' : 'poor';
}

/**
 * Speed Index from (timestamp, histogram) frames — the speedline algorithm:
 * visual progress of each frame = how close its colour histogram is to the final frame.
 */
export function speedIndex(frames: { t: number; hist: number[][] }[]): number | null {
  if (frames.length < 2) return null;
  const first = frames[0].hist;
  const last = frames[frames.length - 1].hist;
  const progress = frames.map((f) => {
    let total = 0;
    let current = 0;
    for (let c = 0; c < 3; c++) {
      for (let i = 0; i < 256; i++) {
        total += Math.abs(first[c][i] - last[c][i]);
        current += Math.abs(f.hist[c][i] - last[c][i]);
      }
    }
    return total === 0 ? 1 : Math.max(0, Math.min(1, 1 - current / total));
  });
  let si = 0;
  for (let i = 0; i < frames.length - 1; i++) si += (1 - progress[i]) * (frames[i + 1].t - frames[i].t);
  return Math.round(si);
}
