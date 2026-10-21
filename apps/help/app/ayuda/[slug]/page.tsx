import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CATEGORIES, getArticle, getArticles } from '@/lib/articles';
import { APP_URL } from '@/lib/site';

export const dynamicParams = false;
export const generateStaticParams = () => getArticles().map((a) => ({ slug: a.slug }));

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const a = getArticle(params.slug);
  return a ? { title: a.title, description: a.summary } : {};
}

export default function ArticlePage({ params }: { params: { slug: string } }) {
  const article = getArticle(params.slug);
  if (!article) notFound();
  const related = getArticles().filter((a) => a.category === article.category && a.slug !== article.slug);
  const category = CATEGORIES.find((c) => c.id === article.category);
  return (
    <div className="wrap article-layout">
      <article className="article">
        <p className="crumbs"><Link href="/ayuda/">Centro de ayuda</Link> › {category?.name}</p>
        <h1>{article.title}</h1>
        <p className="lead">{article.summary}</p>
        {article.video && <div className="video"><iframe src={article.video} title={article.title} allowFullScreen /></div>}
        <div className="prose" dangerouslySetInnerHTML={{ __html: article.html }} />
        <div className="card feedback">
          <span>¿Te sirvió este artículo?</span>
          <Link className="btn" href="/contacto/">No, necesito más ayuda</Link>
          <a className="btn primary" href={APP_URL || '/'}>Sí, ir a la app</a>
        </div>
      </article>
      {related.length > 0 && (
        <aside className="related">
          <h3>Relacionados</h3>
          <ul>{related.map((a) => <li key={a.slug}><Link href={`/ayuda/${a.slug}/`}>{a.title}</Link></li>)}</ul>
        </aside>
      )}
    </div>
  );
}
