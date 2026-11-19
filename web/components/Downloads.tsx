'use client';
import { useEffect, useState } from 'react';
import { useOS } from './useOS';

const CARDS = [
  { os: 'windows', title: 'Windows', sub: 'Windows 10 and 11', href: '/download/windows', cta: 'Download .exe', note: 'Also runs on Windows on ARM.' },
  { os: 'mac', title: 'macOS', sub: 'macOS 11 Big Sur or later · Apple Silicon (M1–M4) and Intel', href: '/download/mac', cta: 'Download .dmg', note: 'Open the .dmg and drag Sightline to Applications.' },
  { os: 'linux', title: 'Linux', sub: 'Ubuntu, Debian, Fedora and most distributions', href: '/download/linux', cta: 'Download AppImage', note: null },
] as const;

export function Downloads() {
  const os = useOS();
  const [ready, setReady] = useState<boolean | null>(null);

  useEffect(() => {
    fetch('/api/config').then((r) => r.json())
      .then((cfg: { available: Record<string, boolean> }) => setReady(Object.values(cfg.available ?? {}).some(Boolean)))
      .catch(() => setReady(null));
  }, []);

  return (
    <>
      <div className="grid cols-3 downloads">
        {CARDS.map((c) => (
          <div key={c.os} className={`card dl${c.os === os ? ' recommended' : ''}`}>
            <h3 className="tagline">{c.title}</h3>
            <p className="caption muted">{c.sub}</p>
            <a className="btn btn-primary" href={c.href}>{c.cta}</a>
            {c.note ? <span className="caption muted">{c.note}</span> : (
              <span className="caption"><a className="text-link" href="/download/linux-deb">.deb</a> · <a className="text-link" href="/download/linux-rpm">.rpm</a></span>
            )}
          </div>
        ))}
      </div>
      {ready === false && <p className="caption muted">Installers are being prepared — use the web app in the meantime.</p>}
    </>
  );
}
