import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";
import { wikiApi, type WikiArticle as WikiArticleType } from "@/lib/wiki";
import { WikiMarkdown } from "@/components/wiki/WikiMarkdown";

type WikiArticlePageProps = {
  wikiKey?: "wiki" | "tc-wiki";
  wikiName?: string;
};

export default function WikiArticlePage({ wikiKey = "wiki", wikiName = "Wiki" }: WikiArticlePageProps) {
  const apiPrefix = `/api/${wikiKey}`;
  const routePrefix = `/${wikiKey}`;
  const { slug } = useParams();
  const [article, setArticle] = useState<WikiArticleType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    wikiApi<WikiArticleType>(`${apiPrefix}/articles/${encodeURIComponent(slug ?? "")}`)
      .then(setArticle)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [apiPrefix, slug]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Loading article" />
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="mx-auto max-w-xl py-24 text-center">
        <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-amber-500" />
        <h1 className="text-2xl font-bold">Article not found</h1>
        <p className="mt-2 text-muted-foreground">{error ?? "This wiki article may have been moved or removed."}</p>
        <Link href={routePrefix} className="mt-6 inline-flex items-center text-sm font-medium text-primary hover:underline">
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to {wikiName}
        </Link>
      </div>
    );
  }

  return (
    <div className="-m-4 min-h-screen bg-[#f1f1ef] text-[#242424] md:-m-8">
      <header className="bg-[#0c0c0c] px-6 py-10 text-white md:px-12 md:py-14 lg:px-16">
        <div className="mx-auto max-w-3xl">
          <Link
            href={routePrefix}
            className="inline-flex items-center text-xs font-bold uppercase tracking-[0.12em] text-white/60 hover:text-white"
          >
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> {wikiName}
          </Link>
          <p className="mt-6 text-xs font-bold uppercase tracking-[0.16em] text-white/50">{article.categoryName}</p>
          <h1 className="mt-2 text-3xl font-black uppercase leading-[1.05] tracking-tight sm:text-4xl">
            {article.title}
          </h1>
          {article.summary && (
            <p className="mt-4 max-w-xl text-base leading-6 text-white/60">{article.summary}</p>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 md:py-16">
        <article className="border border-black/15 bg-white p-6 md:p-10">
          <WikiMarkdown content={article.content} />
        </article>
      </main>
    </div>
  );
}
