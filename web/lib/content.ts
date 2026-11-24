/** Landing-page content. */

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://sightaud.com').replace(/\/$/, '');
export const REPO_URL = 'https://github.com/Zubair-hussain/Sightline';

export interface Feature { name: string; desc: string; app?: boolean }

export const FEATURES: Feature[] = [
  { name: 'Lighthouse-style scores', desc: 'Performance, Accessibility, Best Practices and SEO on a throttled phone, scored with Lighthouse’s published curves and axe-core.', app: true },
  { name: 'SEO', desc: 'Can Google find, understand and rank your pages? Titles, descriptions, headings, robots.txt, sitemap, structured data, duplicates.' },
  { name: 'Core Web Vitals', desc: 'LCP, CLS and TBT measured in a real browser, plus page weight and JavaScript errors.', app: true },
  { name: 'Code coverage', desc: 'How much of your JavaScript and CSS is downloaded but never used — file by file.', app: true },
  { name: 'Links', desc: 'Every <a href> checked: broken links, redirect chains, empty and unsafe links, missing link text.' },
  { name: 'Hreflang', desc: 'Multi-language sites: valid codes, x-default, and return tags verified by visiting every language version.' },
  { name: 'Memory leaks', desc: 'Uses your page over and over and catches growing memory, DOM nodes, listeners and timers — only after you confirm.', app: true },
  { name: 'iPhone & iPad', desc: 'Safari emulation: 44-pt tap targets, input zoom, notch safe areas, touch icon, Universal Links — with a device screenshot.', app: true },
  { name: 'Website health', desc: 'HTTPS, certificate expiry, security headers, cookies, compression, caching, accessibility basics.' },
  { name: 'Cloudflare & DNS', desc: 'Proxying, edge caching, TLS floor, HTTP/3, exposed origin IPs, DNSSEC, CAA, SPF and DMARC.' },
];

export const MCP_TOOLS = ['audit_website', 'generate_test_cases', 'check_lighthouse', 'check_seo', 'check_links', 'check_hreflang', 'check_security', 'check_cloudflare', 'check_performance', 'check_coverage', 'check_mobile_ios', 'check_memory_leaks'];

export const FAQ: { q: string; a: string }[] = [
  { q: 'Is Sightline free?', a: 'Yes. Sightline is open source under the MIT license. The desktop app has no limits, and the web version is free with a fair-use limit per hour.' },
  { q: 'Do I need to be a developer?', a: 'No. Type a website address and press Audit. Every problem comes with a plain explanation and a suggested fix, and each audit has a “What does it check?” button.' },
  { q: 'Why do some audits need the desktop app?', a: 'Lighthouse-style scores, Core Web Vitals, code coverage, iPhone & iPad and memory-leak tests have to open your page in a real browser engine and use it. The desktop app includes that engine; a website cannot safely do this for you.' },
  { q: 'Does it work on a MacBook?', a: 'Yes. The macOS download is a universal app that runs natively on Apple Silicon (M1–M4) and Intel Macs with macOS 11 or later.' },
  { q: 'Are the scores the same as Google Lighthouse?', a: 'Sightline uses Lighthouse’s published scoring curves and the same accessibility engine (axe-core), but it is an independent implementation, so expect close — not identical — numbers.' },
  { q: 'What happens to the sites I audit?', a: 'The desktop app runs entirely on your computer. The web version fetches the page from our server to audit it and does not store your reports — history is kept in your own browser.' },
  { q: 'Can I audit pages on localhost or staging?', a: 'Yes, with the desktop app. The web version only audits public websites.' },
];
