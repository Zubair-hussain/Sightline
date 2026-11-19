/**
 * Protections for running audits on a PUBLIC server (the website):
 * SSRF blocking for every outgoing request and a simple per-IP rate limit.
 */
import { promises as dns } from 'node:dns';
import * as net from 'node:net';
import { setRequestGuard } from './util';

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7));
  return v === '::' || v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') ||
    v.startsWith('fea') || v.startsWith('feb') || v.startsWith('ff');
}

let installed = false;
/** Block requests to loopback, private, link-local, metadata and reserved addresses (checked on every redirect hop). */
export function installPublicGuard(): void {
  if (installed) return;
  installed = true;
  setRequestGuard(async (u) => {
    if (!['http:', 'https:'].includes(u.protocol)) throw new Error('only http(s) allowed');
    if (u.port && !['80', '443', '8080', '8443'].includes(u.port)) throw new Error('port not allowed');
    const host = u.hostname.replace(/^\[|\]$/g, '');
    if (/^(localhost|.*\.local|.*\.internal|.*\.localhost)$/i.test(host)) throw new Error('internal hostname');
    const addrs = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((a) => a.address);
    if (!addrs.length || addrs.some(isPrivateIp)) throw new Error('private or reserved address');
  });
}

/** In-memory sliding-window limiter. On serverless hosts each instance keeps its own window. */
export function createRateLimiter(perHour: number) {
  const hits = new Map<string, number[]>();
  return (ip: string): boolean => {
    const now = Date.now();
    const list = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
    if (list.length >= perHour) { hits.set(ip, list); return false; }
    list.push(now);
    hits.set(ip, list);
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.every((t) => now - t > 3_600_000)) hits.delete(k);
    return true;
  };
}

export const DOWNLOADS: Record<string, { file: string; label: string }> = {
  windows: { file: 'Sightline-Setup-x64.exe', label: 'Windows 10/11 (x64)' },
  mac: { file: 'Sightline-mac-universal.dmg', label: 'macOS 11+ (Apple Silicon & Intel)' },
  linux: { file: 'Sightline-linux-x86_64.AppImage', label: 'Linux AppImage (x64)' },
  'linux-deb': { file: 'Sightline-linux-amd64.deb', label: 'Debian / Ubuntu (.deb)' },
  'linux-rpm': { file: 'Sightline-linux-x86_64.rpm', label: 'Fedora / RHEL (.rpm)' },
};
