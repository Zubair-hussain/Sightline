/** Small, realistic report data shared by the engine tests. */
import { category, check } from '../src/engine/util';

export function coverageData(fileCount = 30): SL.CoverageData {
  const files: SL.CoverageFile[] = [];
  for (let i = 0; i < fileCount; i++) {
    const total = 400_000 - i * 10_000;
    const unused = Math.round(total * (0.8 - i * 0.02));
    files.push({
      url: i % 3 === 2 ? `https://cdn.thirdparty.example/widget-${i}.js` : `https://example.com/_next/static/chunks/${i}.js`,
      type: i % 5 === 4 ? 'css' : 'js', total, unused, pct: Math.round((unused / total) * 100), firstParty: i % 3 !== 2,
    });
  }
  files.sort((a, b) => b.unused - a.unused);
  const sum = (t: 'js' | 'css') => files.filter((f) => f.type === t).reduce((a, f) => ({ total: a.total + f.total, unused: a.unused + f.unused }), { total: 0, unused: 0 });
  return { js: sum('js'), css: sum('css'), files };
}

export function reportWith(categories: Partial<Record<SL.CategoryKey, SL.Category<any>>>): SL.Report {
  return {
    version: '1.0.0', url: 'https://example.com/', finalUrl: 'https://example.com/', startedAt: '2026-11-27T00:00:00.000Z',
    durationMs: 1000, score: 70, categories,
    meta: { status: 200, title: 'Example', server: 'test', redirects: [] },
  };
}

export function coverageCategory(fileCount = 30): SL.Category<SL.CoverageData> {
  return category('coverage', [check('cov.js', 'Unused JavaScript', 'fail', 'test', { weight: 3 })], coverageData(fileCount));
}
