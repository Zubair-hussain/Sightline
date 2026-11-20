import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { SITE_URL, REPO_URL } from '@/lib/content';
import './globals.css';

const title = 'Sightline — Free website audit: SEO, Lighthouse, Core Web Vitals & more';
const description =
  'Free, open-source website audit tool: SEO audit, Lighthouse-style scores, Core Web Vitals, accessibility, broken links, hreflang, code coverage, memory leaks, iPhone Safari and Cloudflare checks. In your browser or as a desktop app for Windows, macOS and Linux.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: title, template: '%s · Sightline' },
  description,
  applicationName: 'Sightline',
  keywords: ['website audit', 'SEO audit', 'Lighthouse', 'Core Web Vitals', 'accessibility checker', 'broken link checker', 'hreflang checker', 'memory leak detector', 'code coverage', 'Cloudflare audit', 'iOS Safari testing', 'launch checklist', 'MCP server'],
  authors: [{ name: 'Zubair Hussain', url: 'https://github.com/Zubair-hussain' }],
  alternates: { canonical: '/', types: { 'text/plain': '/llms.txt' } },
  icons: { icon: '/assets/icon.svg', apple: '/assets/icon-180.png' },
  openGraph: {
    type: 'website', url: '/', siteName: 'Sightline', title: 'Sightline — Every detail. Audited.',
    description: 'SEO, Lighthouse-style scores, links, performance, Cloudflare, iPhone and memory leaks — in one place.',
    images: [{ url: '/assets/og.png', width: 1280, height: 640, alt: 'Sightline — Every detail. Audited.' }],
  },
  twitter: { card: 'summary_large_image', title: 'Sightline — Every detail. Audited.', description, images: ['/assets/og.png'] },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = { themeColor: '#000000', width: 'device-width', initialScale: 1 };

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Sightline',
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Windows, macOS, Linux, Web',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  license: 'https://opensource.org/licenses/MIT',
  codeRepository: REPO_URL,
  url: SITE_URL,
  description,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Design tokens shared with the desktop app (copied to public/app at build time). */}
        <link rel="stylesheet" href="/app/styles.css" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </head>
      <body className="platform-web site">{children}</body>
    </html>
  );
}
