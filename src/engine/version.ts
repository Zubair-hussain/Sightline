/** Version helpers shared by the desktop app's update check and the tests. */

/** Numeric parts of "v1.2.3", "1.2.3-beta.1" or "1.2" (missing parts are 0; pre-release tags ignored). */
export function versionParts(v: string): [number, number, number] {
  const m = String(v).trim().replace(/^v/i, '').match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  return m ? [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)] : [0, 0, 0];
}

/** Negative when a < b, 0 when equal, positive when a > b. */
export function compareVersions(a: string, b: string): number {
  const x = versionParts(a);
  const y = versionParts(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

export const isNewer = (candidate: string, current: string): boolean => compareVersions(candidate, current) > 0;

/** "Version: 2026-11-28" line of TERMS.md, used to ask again when the terms change. */
export function termsVersion(markdown: string): string {
  return markdown.match(/^Version:\s*(\S+)/m)?.[1] ?? '';
}
