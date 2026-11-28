# Changelog

## 1.1.0 — security audits, secrets scanner, terms and updates

- **Cloudflare security audit**: Content-Security-Policy quality and other protection headers, security.txt, email spoofing protection (SPF, DMARC, MTA-STS), subdomain takeover, origin servers revealed by certificate-transparency logs, and with an API token: WAF managed rules, rate limiting, Bot Fight Mode and leaked-credential detection
- **Exposed secrets scanner**: 51 kinds of API keys, tokens, private keys and database passwords on websites (including public source maps and leaked .env or .git files), in folders and in the full Git history; masked results; optional read-only key verification for your own site or code; new sightline secrets command
- **Code coverage in reports**: totals, used and unused bars, your own versus third-party code, the biggest wins and every file
- **What's new**: the app tells you when a new version is available and shows what changed; it never installs anything by itself
- **Terms of use**: shown in the installers, before downloading from sightaud.com and when the app first starts
- The app window is sandboxed and refuses camera, microphone, location and other permission requests
- Fixed: placeholders such as the website name in the memory-test dialog were shown as {host}
- Fixed: Windows, macOS and Linux installers are built again

## 1.0.0 — first public release

- Cloudflare-hosted frontend with a custom audit router, shared rate and capacity limits, health probes and interchangeable Vercel, Netlify and Render API replicas
- Compressed Sightline intro video, editable video source, live deployment link and health-status badge
- 10 audits: SEO, hreflang, links, website health & security, performance (Core Web Vitals), Lighthouse-style scores, code coverage, iPhone & iPad, memory leaks, Cloudflare & DNS
- Lighthouse-style Performance / Accessibility (axe-core) / Best Practices / SEO scores with mobile throttling and Speed Index
- Memory-leak test with automatic or custom steps and a safety confirmation before any interaction
- Launch-day test plan with CSV, Markdown and Playwright exports
- PDF/HTML reports styled with the audited site's brand, with desktop and iPhone screenshots
- Desktop app for Windows, macOS (universal) and Linux; web app; CLI; MCP server for AI apps
- 14 languages including right-to-left Arabic and Urdu
