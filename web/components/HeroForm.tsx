'use client';
import { useState, type FormEvent } from 'react';
import { useOS } from './useOS';
import { OS_NAME } from './os';

export function HeroForm() {
  const [url, setUrl] = useState('');
  const os = useOS();

  function submit(e: FormEvent) {
    e.preventDefault();
    const v = url.trim();
    // /app is a static bundle, so use a full navigation rather than client-side routing.
    window.location.href = v ? `/app?url=${encodeURIComponent(v)}` : '/app';
  }

  return (
    <>
      <form className="search" role="search" onSubmit={submit}>
        <label className="field">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            type="text" name="url" inputMode="url" autoComplete="url" spellCheck={false}
            placeholder="Enter a website, e.g. apple.com" aria-label="Website to audit"
            value={url} onChange={(e) => setUrl(e.target.value)}
          />
        </label>
        <button className="btn btn-primary btn-hero" type="submit">Audit free</button>
      </form>
      <p className="hero-sub">
        No sign-up. Runs in your browser — or <a href="#download">download for {OS_NAME[os]}</a> for all 10 audits.
      </p>
    </>
  );
}
