import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SiteHeader, SiteFooter } from '@/components/SiteChrome';
import { formatDate, getPost, getPosts, postPath } from '@/lib/blogger';
import { SITE_URL } from '@/lib/content';

export const revalidate = 600;
/** Posts published after the last build render on demand where the server supports it (Vercel, Docker). */
export const dynamicParams = true;

type Params = { year: string; month: string; slug: string };

export async function generateStaticParams(): Promise<Params[]> {
  return (await getPosts()).map(({ year, month, slug }) => ({ year, month, slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { year, month, slug } = await params;
  const post = await getPost(year, month, slug);
  if (!post) return { title: 'Post not found', robots: { index: false } };
  const path = postPath(post);
  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: path },
    openGraph: {
      type: 'article', url: path, title: post.title, description: post.excerpt,
      publishedTime: post.published, modifiedTime: post.updated, authors: [post.author], tags: post.labels,
      images: [post.image || '/assets/og.png'],
    },
    twitter: { card: 'summary_large_image', title: post.title, description: post.excerpt, images: [post.image || '/assets/og.png'] },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<Params> }) {
  const { year, month, slug } = await params;
  const post = await getPost(year, month, slug);
  if (!post) notFound();
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'BlogPosting', headline: post.title, description: post.excerpt,
    datePublished: post.published, dateModified: post.updated, author: { '@type': 'Person', name: post.author },
    publisher: { '@type': 'Organization', name: 'Sightline', logo: { '@type': 'ImageObject', url: `${SITE_URL}/assets/icon-180.png` } },
    mainEntityOfPage: `${SITE_URL}${postPath(post)}`, ...(post.image ? { image: post.image } : {}), keywords: post.labels.join(', '),
  };
  return (
    <>
      <SiteHeader />
      <main>
        <article className="tile tile-light post">
          <div className="inner narrow">
            <p className="post-back"><a href="/blog">← All posts</a></p>
            <p className="post-meta"><time dateTime={post.published}>{formatDate(post.published)}</time> · {post.author}</p>
            <h1 className="display-lg post-heading">{post.title}</h1>
            {post.labels.length > 0 && <p className="post-labels">{post.labels.map((l) => <span className="badge" key={l}>{l}</span>)}</p>}
            {/* Post HTML comes from the site owner's Blogger blog and is sanitised in lib/blogger.ts. */}
            <div className="prose" dangerouslySetInnerHTML={{ __html: post.html }} />
            <div className="post-cta card">
              <h2 className="tagline">Check your own website</h2>
              <p className="caption">Run a free audit: SEO, speed, links, security and more, each with a plain-language fix.</p>
              <a className="btn btn-primary btn-small" href="/app">Audit a website</a>
            </div>
          </div>
        </article>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </main>
      <SiteFooter />
    </>
  );
}
