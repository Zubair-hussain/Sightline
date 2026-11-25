import { REPO_URL } from '@/lib/content';

/** Section links point at the homepage; on the homepage itself `base` is '' so they stay in-page anchors. */
export function SiteHeader({ base = '/' }: { base?: '' | '/' }) {
  return (
    <header className="global-nav">
      <a className="brand" href="/" aria-label="Sightline home">
        <img src="/assets/icon.svg" alt="" aria-hidden="true" />
        <span>Sightline</span>
      </a>
      <nav aria-label="Main">
        <a className="nav-link" href={`${base}#features`}>Features</a>
        <a className="nav-link" href={`${base}#ways`}>How to use</a>
        <a className="nav-link" href={`${base}#ai`}>AI apps</a>
        <a className="nav-link" href={`${base}#download`}>Download</a>
        <a className="nav-link" href="/blogs">Blog</a>
        <a className="nav-link" href={`${base}#faq`}>FAQ</a>
        <a className="nav-link" href={REPO_URL}>GitHub</a>
      </nav>
    </header>
  );
}

export function SiteFooter({ base = '/' }: { base?: '' | '/' }) {
  return (
    <footer className="site-footer">
      <div className="inner">
        <div className="legal">
          <span>Sightline — open-source website audits for Windows, macOS, Linux and the web.</span>
          <span><a href="/app">Web app</a> · <a href={`${base}#download`}>Download</a> · <a href="/blogs">Blog</a> · <a href={REPO_URL}>GitHub</a> · <a href="/llms.txt">llms.txt</a></span>
        </div>
        <p className="muted">Scores are heuristics. Verify critical findings before acting on them. Lighthouse is a trademark of Google LLC; Sightline is not affiliated with Google.</p>
      </div>
    </footer>
  );
}
