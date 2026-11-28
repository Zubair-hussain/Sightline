import Image from 'next/image';
import { HeroForm } from '@/components/HeroForm';
import { Downloads } from '@/components/Downloads';
import { McpSnippet } from '@/components/McpSnippet';
import { SiteHeader, SiteFooter } from '@/components/SiteChrome';
import { readTerms } from '@/lib/terms';
import { FEATURES, FAQ, MCP_TOOLS } from '@/lib/content';

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
};

export default function Home() {
  return (
    <>
      <SiteHeader base="" />

      <div className="sub-nav">
        <div className="title">Sightline</div>
        <div className="links">
          <a href="#features">10 audits</a>
          <a href="#download">Windows · Mac · Linux</a>
        </div>
        <a className="btn btn-primary btn-small" href="/app">Audit a website</a>
      </div>

      <main>
        <section className="tile tile-parchment hero">
          <div className="inner">
            <p className="eyebrow">Sightline</p>
            <h1 className="hero-display">Every detail. Audited.</h1>
            <p className="lead">SEO, Lighthouse-style scores, broken links, security, speed, Cloudflare, iPhone and memory leaks — checked in one place, explained in plain language.</p>
            <HeroForm />
            <div className="shot">
              <Image src="/assets/app-report.png" alt="Sightline report showing an overall score and category scores" width={1600} height={1000} priority sizes="(max-width: 1100px) 100vw, 1100px" />
            </div>
          </div>
        </section>

        <section className="tile tile-dark on-dark" id="features">
          <div className="inner">
            <h2 className="display-lg">Ten audits. One report.</h2>
            <p className="lead muted">Every finding says what is wrong, why it matters and how to fix it.</p>
            <div className="grid site-features">
              {FEATURES.map((f) => (
                <div className="feature-card" key={f.name}>
                  <h3 className="name">{f.name} {f.app && <span className="badge">App</span>}</h3>
                  <p className="desc">{f.desc}</p>
                </div>
              ))}
            </div>
            <p className="caption muted" style={{ marginTop: 32 }}>Audits marked <span className="badge">App</span> need a real browser engine, so they run in the free desktop app.</p>
          </div>
        </section>

        <section className="tile tile-light" id="ways">
          <div className="inner">
            <h2 className="display-lg">Use it your way.</h2>
            <p className="lead">No code needed. Developers get a CLI and AI integration too.</p>
            <div className="grid cols-3 ways">
              <div className="card">
                <p className="eyebrow">Desktop app</p>
                <h3 className="tagline">All 10 audits</h3>
                <p className="caption">Including Lighthouse-style scores, code coverage, iPhone & iPad and memory leaks. Unlimited audits, branded PDF reports, launch-day test plans, 14 languages.</p>
                <a className="btn btn-primary btn-small" href="#download">Download</a>
              </div>
              <div className="card">
                <p className="eyebrow">In your browser</p>
                <h3 className="tagline">Nothing to install</h3>
                <p className="caption">SEO, hreflang, links, website health and Cloudflare. Export PDF, HTML, JSON and the test plan.</p>
                <a className="btn btn-secondary btn-small" href="/app">Open web app</a>
              </div>
              <div className="card">
                <p className="eyebrow">AI apps & developers</p>
                <h3 className="tagline">MCP & command line</h3>
                <p className="caption">Ask Cursor or VS Code to “audit my site”, or run audits in CI with a pass/fail score.</p>
                <a className="btn btn-secondary btn-small" href="#ai">Set up</a>
              </div>
            </div>
          </div>
        </section>

        <section className="tile tile-parchment" id="ai">
          <div className="inner narrow">
            <h2 className="display-lg">Connect your AI apps.</h2>
            <p className="lead">Sightline speaks MCP (Model Context Protocol), so AI assistants can audit websites for you.</p>
            <ol className="steps">
              <li><strong>Install the desktop app</strong> and open <em>Settings → Connect AI apps</em>.</li>
              <li><strong>Copy the snippet</strong> into your AI app: Cursor (<em>Settings → MCP</em>) or VS Code (<em>.vscode/mcp.json</em>).</li>
              <li><strong>Ask</strong>: “Audit example.com and tell me what to fix first” or “Generate a launch-day test plan for example.com”.</li>
            </ol>
            <McpSnippet />
            <p className="caption muted">Tools: {MCP_TOOLS.join(', ')}.</p>
          </div>
        </section>

        <section className="tile tile-dark on-dark" id="download">
          <div className="inner">
            <h2 className="display-lg">Download Sightline.</h2>
            <p className="lead muted">Free and open source for Windows, macOS and Linux.</p>
            <Downloads termsVersion={readTerms().version} />
          </div>
        </section>

        <section className="tile tile-light" id="faq">
          <div className="inner narrow faq">
            <h2 className="display-lg">Questions.</h2>
            {FAQ.map((f) => (
              <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>
            ))}
          </div>
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
        </section>
      </main>

      <SiteFooter base="" />
    </>
  );
}
