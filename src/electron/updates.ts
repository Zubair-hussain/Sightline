/**
 * "Is there a newer Sightline?" — asks GitHub for the latest published release, at most once a day
 * (the answer is cached on disk), and never downloads or installs anything. The renderer shows the
 * release notes and the user decides whether to open the download page.
 */
import { app } from 'electron';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { isNewer } from '../engine/version';

const LATEST = 'https://api.github.com/repos/Zubair-hussain/Sightline/releases/latest';
const DAY = 24 * 60 * 60 * 1000;

const platformSlug = (): string => (process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux');
const cacheFile = () => path.join(app.getPath('userData'), 'update-check.json');

interface Release { tag_name?: string; name?: string; body?: string; html_url?: string; published_at?: string; draft?: boolean; prerelease?: boolean }

export async function checkForUpdates(force = false): Promise<SL.UpdateInfo> {
  const current = app.getVersion();
  const base = { current, downloadUrl: `https://sightaud.com/download/${platformSlug()}`, releasesUrl: 'https://github.com/Zubair-hussain/Sightline/releases' };
  if (!force) {
    try {
      const cached = JSON.parse(await fs.readFile(cacheFile(), 'utf8')) as SL.UpdateInfo;
      if (cached.current === current && Date.now() - Date.parse(cached.checkedAt) < DAY) return cached;
    } catch { /* no cache yet */ }
  }
  let info: SL.UpdateInfo;
  try {
    const res = await fetch(LATEST, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': `Sightline/${current}` },
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 404) {
      info = { ...base, available: false, latest: null, notes: '', publishedAt: null, checkedAt: new Date().toISOString() };
    } else if (!res.ok) {
      throw new Error(`GitHub answered ${res.status}`);
    } else {
      const r = await res.json() as Release;
      const latest = (r.tag_name ?? '').replace(/^v/i, '') || null;
      info = {
        ...base, latest, available: Boolean(latest && !r.draft && !r.prerelease && isNewer(latest, current)),
        notes: (r.body ?? '').slice(0, 20000), releaseUrl: r.html_url, publishedAt: r.published_at ?? null, checkedAt: new Date().toISOString(),
      };
    }
    await fs.mkdir(path.dirname(cacheFile()), { recursive: true });
    await fs.writeFile(cacheFile(), JSON.stringify(info), 'utf8');
  } catch (err) {
    info = { ...base, available: false, latest: null, notes: '', publishedAt: null, checkedAt: new Date().toISOString(), error: (err as Error).message };
  }
  return info;
}
