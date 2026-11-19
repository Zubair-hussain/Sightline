/* Landing page behaviour: OS detection for the download button, availability, hero form. */

type OS = 'windows' | 'mac' | 'linux' | 'other';

function detectOS(): OS {
  const p = ((navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || navigator.userAgent).toLowerCase();
  if (p.includes('win')) return 'windows';
  if (p.includes('mac') && !/iphone|ipad/i.test(navigator.userAgent)) return 'mac';
  if (p.includes('linux') && !/android/i.test(navigator.userAgent)) return 'linux';
  return 'other';
}

const NAMES: Record<OS, string> = { windows: 'Windows', mac: 'Mac', linux: 'Linux', other: 'your computer' };
const MCP_PATH: Record<OS, string> = {
  windows: 'C:\\\\Users\\\\YOU\\\\AppData\\\\Local\\\\Programs\\\\Sightline\\\\Sightline.exe',
  mac: '/Applications/Sightline.app/Contents/MacOS/Sightline',
  linux: '/opt/Sightline/sightline',
  other: '/Applications/Sightline.app/Contents/MacOS/Sightline',
};

const os = detectOS();
document.querySelectorAll('[data-os-name]').forEach((el) => { el.textContent = NAMES[os]; });
document.querySelectorAll('[data-mcp-path]').forEach((el) => { el.textContent = MCP_PATH[os]; });
document.querySelector(`.dl[data-os="${os}"]`)?.classList.add('recommended');

// Hero form → web app with the URL pre-filled
document.getElementById('hero-form')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const v = (document.querySelector('#hero-form input') as HTMLInputElement).value.trim();
  location.href = v ? `/app?url=${encodeURIComponent(v)}` : '/app';
});

// Tell visitors honestly when installers have not been published yet
fetch('/api/config').then((r) => r.json()).then((cfg: { available: Record<string, boolean> }) => {
  const any = Object.values(cfg.available || {}).some(Boolean);
  const status = document.getElementById('dl-status');
  if (!any && status) status.textContent = 'Installers are being prepared — use the web app in the meantime.';
}).catch(() => undefined);
