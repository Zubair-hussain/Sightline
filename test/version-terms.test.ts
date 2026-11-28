import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { compareVersions, isNewer, termsVersion, versionParts } from '../src/engine/version';
import { VERSION } from '../src/engine/index';

const root = path.join(__dirname, '../..');
const read = (f: string) => fs.readFileSync(path.join(root, f), 'utf8');

test('versions compare numerically, with or without a v prefix', () => {
  assert.deepEqual(versionParts('v1.10.2'), [1, 10, 2]);
  assert.deepEqual(versionParts('2.0'), [2, 0, 0]);
  assert.deepEqual(versionParts('1.2.3-beta.1'), [1, 2, 3]);
  assert.ok(isNewer('1.10.0', '1.9.9'), '1.10 is newer than 1.9 (not a string comparison)');
  assert.ok(isNewer('v1.1.0', '1.0.0'));
  assert.ok(!isNewer('1.1.0', '1.1.0'));
  assert.ok(!isNewer('1.0.9', '1.1.0'));
  assert.equal(compareVersions('garbage', '0.0.0'), 0);
});

test('the app, the engine and the changelog agree on the version', () => {
  const pkg = JSON.parse(read('package.json')) as { version: string };
  assert.equal(VERSION, pkg.version, 'src/engine/index.ts VERSION must match package.json');
  assert.match(read('CHANGELOG.md'), new RegExp(`^## ${pkg.version.replace(/\./g, '\\.')} `, 'm'), 'CHANGELOG.md needs an entry for this version');
});

test('the terms have a version, and the installer copy matches TERMS.md', () => {
  const terms = read('TERMS.md');
  assert.match(termsVersion(terms), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(read('build/license_en.txt'), terms.replace(/\*\*/g, ''), 'build/license_en.txt must be TERMS.md without bold markers');
  for (const promise of ['does not access your other apps', 'not responsible', 'Windows', 'macOS', 'Linux', 'new and still being developed', 'never installs anything by itself']) {
    assert.ok(terms.includes(promise), `TERMS.md should mention: ${promise}`);
  }
});

test('the desktop app ships the terms and changelog, and the Windows installer shows the terms', () => {
  const pkg = JSON.parse(read('package.json')) as { build: { files: string[]; nsis: { license?: string }; rpm?: { fpm?: string[] } } };
  assert.ok(pkg.build.files.includes('TERMS.md') && pkg.build.files.includes('CHANGELOG.md'));
  assert.equal(pkg.build.nsis.license, 'build/license_en.txt');
  assert.ok(pkg.build.rpm?.fpm?.some((a) => a.includes('_build_id_links none')), 'rpm build-id fix for current Ubuntu runners');
});
