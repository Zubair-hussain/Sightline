export type OS = 'windows' | 'mac' | 'linux' | 'other';

export function detectOS(): OS {
  if (typeof navigator === 'undefined') return 'other';
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const p = (nav.userAgentData?.platform || navigator.platform || navigator.userAgent).toLowerCase();
  if (p.includes('win')) return 'windows';
  if (p.includes('mac') && !/iphone|ipad/i.test(navigator.userAgent)) return 'mac';
  if (p.includes('linux') && !/android/i.test(navigator.userAgent)) return 'linux';
  return 'other';
}

export const OS_NAME: Record<OS, string> = { windows: 'Windows', mac: 'Mac', linux: 'Linux', other: 'your computer' };

export const MCP_PATH: Record<OS, string> = {
  windows: 'C:\\\\Users\\\\YOU\\\\AppData\\\\Local\\\\Programs\\\\Sightline\\\\Sightline.exe',
  mac: '/Applications/Sightline.app/Contents/MacOS/Sightline',
  linux: '/opt/Sightline/sightline',
  other: '/Applications/Sightline.app/Contents/MacOS/Sightline',
};
