'use client';
import { useEffect, useRef, useState } from 'react';
import { useOS } from './useOS';

const CARDS = [
  { os: 'windows', title: 'Windows', sub: 'Windows 10 and 11', href: '/download/windows', cta: 'Download .exe', note: 'Also runs on Windows on ARM.' },
  { os: 'mac', title: 'macOS', sub: 'macOS 11 Big Sur or later · Apple Silicon (M1–M4) and Intel', href: '/download/mac', cta: 'Download .dmg', note: 'Open the .dmg and drag Sightline to Applications.' },
  { os: 'linux', title: 'Linux', sub: 'Ubuntu, Debian, Fedora and most distributions', href: '/download/linux', cta: 'Download AppImage', note: null },
] as const;

const ACCEPTED_KEY = 'sl.termsAccepted';

/**
 * Download buttons. Before the first download the visitor sees the key terms and must accept them
 * (remembered per terms version). When no installer is published yet, the buttons explain that
 * instead of leading to a missing file.
 */
export function Downloads({ termsVersion }: { termsVersion: string }) {
  const os = useOS();
  const [ready, setReady] = useState<boolean | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    fetch('/api/config').then((r) => r.json())
      .then((cfg: { available: Record<string, boolean> }) => setReady(Object.values(cfg.available ?? {}).some(Boolean)))
      .catch(() => setReady(null));
  }, []);

  useEffect(() => {
    if (pending) dialog.current?.showModal(); else dialog.current?.close();
  }, [pending]);

  const accepted = () => { try { return localStorage.getItem(ACCEPTED_KEY) === termsVersion; } catch { return false; } };
  const onDownload = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const href = e.currentTarget.getAttribute('href')!;
    if (ready !== false && accepted()) return;
    e.preventDefault();
    setAgreed(false);
    setPending(href);
  };
  const confirm = () => {
    try { localStorage.setItem(ACCEPTED_KEY, termsVersion); } catch { /* private browsing */ }
    const href = pending!;
    setPending(null);
    window.location.href = href;
  };

  return (
    <>
      <div className="grid cols-3 downloads">
        {CARDS.map((c) => (
          <div key={c.os} className={`card dl${c.os === os ? ' recommended' : ''}`}>
            <h3 className="tagline">{c.title}</h3>
            <p className="caption muted">{c.sub}</p>
            <a className="btn btn-primary" href={c.href} onClick={onDownload}>{c.cta}</a>
            {c.note ? <span className="caption muted">{c.note}</span> : (
              <span className="caption"><a className="text-link" href="/download/linux-deb" onClick={onDownload}>.deb</a> · <a className="text-link" href="/download/linux-rpm" onClick={onDownload}>.rpm</a></span>
            )}
          </div>
        ))}
      </div>
      <p className="caption muted">By downloading you agree to the <a className="text-link" href="/terms">terms of use</a>.</p>
      {ready === false && <p className="caption muted">Installers are being prepared. Use the <a className="text-link" href="/app">web app</a> in the meantime.</p>}

      <dialog ref={dialog} className="terms-gate" aria-labelledby="gate-title" onCancel={(e) => { e.preventDefault(); setPending(null); }}>
        {ready === false ? (
          <>
            <h2 id="gate-title" className="tagline">Installers are on their way</h2>
            <p>The Windows, macOS and Linux installers for this version are still being built. Please try again a little later, or use the free <a className="text-link" href="/app">web app</a> now.</p>
            <div className="gate-actions"><button type="button" className="btn btn-primary" onClick={() => setPending(null)}>OK</button></div>
          </>
        ) : (
          <>
            <h2 id="gate-title" className="tagline">Before you download</h2>
            <ul className="gate-points">
              <li><strong>Sightline is new software.</strong> It may not work correctly on every computer, and its results can be wrong. If you spot anything wrong, please <a className="text-link" href="https://github.com/Zubair-hussain/Sightline/issues">tell us</a>.</li>
              <li><strong>It does not access your other apps</strong>, their data, or your browser&apos;s logins and passwords. Its window is sandboxed and refuses camera, microphone and location access.</li>
              <li><strong>No warranty, no liability.</strong> Sightline is free and provided as is. We are not responsible for any loss or damage from downloading, installing or using it, on Windows, macOS or Linux.</li>
              <li><strong>Updates are your choice.</strong> The app tells you when a new version is out and what is new; it never installs anything by itself.</li>
            </ul>
            <label className="gate-check"><input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} /> I have read and agree to the <a className="text-link" href="/terms" target="_blank" rel="noopener">terms of use</a></label>
            <div className="gate-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setPending(null)}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={!agreed} onClick={confirm}>Accept and download</button>
            </div>
          </>
        )}
      </dialog>
    </>
  );
}
