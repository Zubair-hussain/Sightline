import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverageSection, renderHtmlReport } from '../src/engine/report-html';
import { coverageCategory, coverageData, reportWith } from './fixtures';

test('coverage section shows totals, used/unused bars, owner split and biggest wins', () => {
  const html = coverageSection(coverageData());
  assert.match(html, /class="cov-cards"/);
  assert.match(html, /Unused JavaScript ·/);
  assert.match(html, /Unused CSS ·/);
  assert.match(html, /Could be removed ·/);
  assert.match(html, /Files measured · 10 third-party/);
  assert.match(html, /aria-label="JavaScript: \d+%"/);
  assert.match(html, /Unused, by owner/);
  assert.equal((html.match(/<li><strong>Save /g) ?? []).length, 5, 'five biggest wins');
});

test('the file list shows 25 rows and counts the rest', () => {
  const html = coverageSection(coverageData(30));
  const table = html.slice(html.indexOf('<table class="cov">'));
  assert.equal((table.match(/<tr><td>(JS|CSS)<\/td>/g) ?? []).length, 25);
  assert.match(table, /… and 5 more file\(s\)/);
  assert.doesNotMatch(coverageSection(coverageData(10)), /more file\(s\)/);
});

test('third-party files are labelled and long URLs are shortened', () => {
  const data = coverageData(3);
  data.files[0].url = `https://example.com/${'a'.repeat(200)}.js`;
  const html = coverageSection(data);
  assert.match(html, /<span class="tag">3rd-party<\/span>/);
  assert.match(html, /…a{80,}\.js/);
  assert.doesNotMatch(html, /a{120}/);
});

test('file names are HTML-escaped', () => {
  const data = coverageData(1);
  data.files[0].url = 'https://example.com/<script>x</script>.js';
  const html = coverageSection(data);
  assert.doesNotMatch(html, /<script>x/);
  assert.match(html, /&lt;script&gt;x/);
});

test('no coverage data renders nothing, and the PDF report includes the section', () => {
  assert.equal(coverageSection(undefined), '');
  assert.equal(coverageSection({ js: { total: 0, unused: 0 }, css: { total: 0, unused: 0 }, files: [] }), '');
  const pdf = renderHtmlReport(reportWith({ coverage: coverageCategory() }), { theme: 'sightline', target: 'pdf' });
  assert.match(pdf, /class="cov-cards"/);
  assert.match(pdf, /Biggest wins/);
});
