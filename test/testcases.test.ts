import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { generateTestCases } from '../src/engine/testcases';
import { reportWith } from './fixtures';

test('launch-day test case IDs are unique', () => {
  const ids = generateTestCases(reportWith({})).map((c) => c.id);
  assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), []);
});

test('every check a test case relies on exists in the engine', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../src/engine/testcases.ts'), 'utf8');
  const engine = ['security.ts', 'cloudflare.ts', 'website.ts', 'seo.ts', 'links.ts', 'hreflang.ts']
    .map((f) => fs.readFileSync(path.join(__dirname, '../../src/engine', f), 'utf8')).join('\n');
  const referenced = [...src.matchAll(/checks: \[([^\]]*)\]/g)].flatMap((m) => [...m[1].matchAll(/'((?:sec|cf)\.[a-z0-9.-]+)'/g)].map((x) => x[1]));
  const missing = [...new Set(referenced)].filter((id) => !engine.includes(`'${id}'`));
  assert.deepEqual(missing, []);
});
