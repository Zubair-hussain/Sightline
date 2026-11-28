import type { Metadata } from 'next';
import { SiteHeader, SiteFooter } from '@/components/SiteChrome';
import { Markdown } from '@/components/Markdown';
import { readTerms } from '@/lib/terms';

export const metadata: Metadata = {
  title: 'Terms of use',
  description: 'Terms of use for the Sightline desktop app (Windows, macOS, Linux), web app, CLI and MCP server: new software, what the app can access, no warranty and no liability for losses.',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  const { markdown } = readTerms();
  return (
    <>
      <SiteHeader />
      <main>
        <section className="tile tile-light legal-page">
          <div className="inner narrow">
            <p className="eyebrow">Sightline</p>
            <h1 className="display-lg">Terms of use</h1>
            <p className="caption muted">These terms also appear in the installers and when the desktop app first starts.</p>
            <div className="prose">
              <Markdown source={markdown} skipTitle />
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
