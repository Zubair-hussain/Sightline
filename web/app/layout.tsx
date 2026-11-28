import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { SITE_URL, REPO_URL } from '@/lib/content';
import './globals.css';

const ADSENSE_CLIENT = 'ca-pub-4022149996537615';
// GA4 (G-ZYH5HM0HG6) is loaded by this Tag Manager container's own Google tag. Adding gtag('config')
// here as well would count every page view twice. The /app page, which cannot use GTM, loads GA4 directly.
const GTM_ID = 'GTM-MQV8P8VM';

/** EEA, UK and Switzerland: analytics and ad cookies stay off until the visitor consents. */
const CONSENT_REGIONS = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'GB', 'CH'];

/**
 * Google Consent Mode defaults, then Google Tag Manager. The defaults must run before any tag loads;
 * the AdSense consent message (Privacy & messaging) updates them when a visitor chooses.
 */
const TAGS = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',wait_for_update:500,region:${JSON.stringify(CONSENT_REGIONS)}});
gtag('consent','default',{ad_storage:'granted',ad_user_data:'granted',ad_personalization:'granted',analytics_storage:'granted'});
(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s);j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GTM_ID}');`;

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
        {/* Consent defaults, then Google Tag Manager (which loads GA4) — first, so no tag runs before consent is set. */}
        <script dangerouslySetInnerHTML={{ __html: TAGS }} />
        {/* Design tokens shared with the desktop app (copied to public/app at build time). */}
        <link rel="stylesheet" href="/app/styles.css" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        {/* Google AdSense (site pages only; the /app audit tool keeps its strict self-only CSP). */}
        <script async src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`} crossOrigin="anonymous" />
      </head>
      <body className="platform-web site">
        {/* Google Tag Manager for visitors without JavaScript. */}
        <noscript><iframe src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`} height="0" width="0" style={{ display: 'none', visibility: 'hidden' }} title="Google Tag Manager" /></noscript>
        {children}
      </body>
    </html>
  );
}
