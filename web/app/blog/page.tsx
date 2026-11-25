import type { Metadata } from 'next';
import { SiteHeader, SiteFooter } from '@/components/SiteChrome';
import { blogConfigured, formatDate, getPosts, postPath } from '@/lib/blogger';
import { SITE_URL } from '@/lib/content';

export const revalidate = 600;

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Guides and news from Sightline: SEO, website performance, accessibility, broken links and launch-day checklists, explained in plain language.',
  alternates: { canonical: '/blog' },
  openGraph: { type: 'website', url: '/blog', title: 'Sightline Blog', images: ['/assets/og.png'] },
};

export default async function BlogIndex() {
  const posts = await getPosts();
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'Blog', name: 'Sightline Blog', url: `${SITE_URL}/blog`,
    blogPost: posts.slice(0, 20).map((p) => ({ '@type': 'BlogPosting', headline: p.title, url: `${SITE_URL}${postPath(p)}`, datePublished: p.published })),
  };
  return (
    <>
      <SiteHeader />
      <main>
        <section className="tile tile-parchment blog-hero">
          <div className="inner narrow">
            <p className="eyebrow">Sightline Blog</p>
            <h1 className="display-lg">Every detail, explained.</h1>
            <p className="lead">Guides on SEO, speed, accessibility and launching websites that work.</p>
          </div>
        </section>
        <section className="tile tile-light">
          <div className="inner blog-list">
            {posts.length === 0 ? (
              <p className="lead muted blog-empty">{blogConfigured() ? 'No posts yet. Check back soon.' : 'The blog is coming soon.'}</p>
            ) : (
              posts.map((p) => (
                <article className="post-card" key={p.id}>
                  <a href={postPath(p)} className="post-link">
                    {p.image && <img src={p.image} alt="" loading="lazy" decoding="async" />}
                    <div className="post-body">
                      <p className="post-meta"><time dateTime={p.published}>{formatDate(p.published)}</time>{p.labels.length > 0 && <> · {p.labels.slice(0, 2).join(', ')}</>}</p>
                      <h2 className="post-title">{p.title}</h2>
                      <p className="post-excerpt">{p.excerpt}</p>
                    </div>
                  </a>
                </article>
              ))
            )}
          </div>
        </section>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </main>
      <SiteFooter />
    </>
  );
}
