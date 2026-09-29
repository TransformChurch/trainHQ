import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  AlertTriangle,
  BookOpen,
  Baby,
  ChevronRight,
  ClipboardList,
  Clock,
  Compass,
  GraduationCap,
  Loader2,
  Megaphone,
  Search,
  ShieldCheck,
} from "lucide-react";
import { wikiApi, type WikiCategory } from "@/lib/wiki";

const iconMap: Record<string, typeof BookOpen> = {
  "mission-values": Compass,
  "employee-handbook": BookOpen,
  "workplace-policies": ShieldCheck,
  "time-hours-reviews": Clock,
  "kids-youth-policies": Baby,
  "comms-brand": Megaphone,
  "trainings-best-practices": GraduationCap,
  "requests-forms": ClipboardList,
};

type WikiProps = {
  wikiKey?: "wiki" | "tc-wiki";
  wikiName?: string;
};

export default function Wiki({ wikiKey = "wiki", wikiName = "Wiki" }: WikiProps) {
  const apiPrefix = `/api/${wikiKey}`;
  const routePrefix = `/${wikiKey}`;
  const [categories, setCategories] = useState<WikiCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    wikiApi<WikiCategory[]>(apiPrefix)
      .then(setCategories)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [apiPrefix]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredCategories = useMemo(() => {
    if (!normalizedQuery) return categories;
    return categories
      .map((category) => ({
        ...category,
        articles: category.articles.filter((article) =>
          article.title.toLowerCase().includes(normalizedQuery) ||
          (article.summary ?? "").toLowerCase().includes(normalizedQuery),
        ),
      }))
      .filter((category) => category.articles.length > 0);
  }, [categories, normalizedQuery]);

  const visibleCategories = filteredCategories.filter((category) => category.articles.length > 0);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Loading Wiki" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-xl py-24 text-center">
        <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-amber-500" />
        <h1 className="text-2xl font-bold">{wikiName} is not available</h1>
        <p className="mt-2 text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div className="-m-4 min-h-screen bg-[#f1f1ef] text-[#242424] md:-m-8">
      <header className="bg-[#0c0c0c] px-6 py-10 text-white md:px-12 md:py-16 lg:px-16 lg:py-20">
        <div className="mx-auto max-w-5xl">
          <p className="text-sm font-bold uppercase tracking-[0.12em] md:text-base">
            Transform Church <span className="font-normal text-white/55">{wikiName}</span>
          </p>
          <div className="mt-14 max-w-2xl md:mt-20">
            <h1 className="text-4xl font-black uppercase leading-[0.95] tracking-tight sm:text-5xl md:text-6xl">
              Everything staff<br />need to know.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-6 text-white/60 md:text-lg md:leading-7">
              Policies, handbooks, guidelines, and the Request Hub directory — all in one searchable
              place, instead of a folder of PDFs.
            </p>
          </div>
          <div className="relative mt-10 max-w-md">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search the wiki…"
              aria-label="Search the wiki"
              className="w-full border border-white/25 bg-white/5 py-3 pl-11 pr-4 text-sm text-white placeholder:text-white/40 focus:border-white/60 focus:outline-none"
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16">
        {visibleCategories.length > 1 && !normalizedQuery && (
          <nav className="mb-12 flex flex-wrap gap-2" aria-label="Wiki categories">
            {visibleCategories.map((category) => (
              <a
                key={category.id}
                href={`#category-${category.id}`}
                className="border border-black/20 bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.1em] transition-colors hover:border-black hover:bg-black hover:text-white focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2"
              >
                {category.name}
              </a>
            ))}
          </nav>
        )}

        {visibleCategories.length === 0 ? (
          <div className="border border-black/15 bg-white p-10 text-center">
            <BookOpen className="mx-auto h-9 w-9 text-black/35" />
            <h2 className="mt-4 text-xl font-bold">
              {normalizedQuery ? "No articles match your search" : "No wiki articles are available yet"}
            </h2>
            <p className="mt-2 text-sm text-black/55">
              {normalizedQuery ? "Try a different search term." : "Please check back later or contact an administrator."}
            </p>
          </div>
        ) : (
          <div className="space-y-16">
            {visibleCategories.map((category) => {
              const Icon = iconMap[category.slug] ?? BookOpen;
              return (
                <section key={category.id} id={`category-${category.id}`} className="scroll-mt-6">
                  <div className="mb-6 flex items-start gap-4 border-b border-black/20 pb-4">
                    <div className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center border border-black">
                      <Icon className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-black uppercase tracking-tight md:text-3xl">{category.name}</h2>
                      {category.description && (
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-black/60">{category.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="grid border-l border-t border-black/15 sm:grid-cols-2 xl:grid-cols-3">
                    {category.articles.map((article) => (
                      <Link
                        key={article.id}
                        href={`${routePrefix}/${article.slug}`}
                        className="group flex min-h-[160px] flex-col justify-between border-b border-r border-black/15 bg-white p-6 transition-colors hover:bg-black hover:text-white md:p-7"
                        data-testid={`wiki-article-${article.id}`}
                      >
                        <div>
                          <h3 className="text-lg font-black uppercase leading-6 tracking-tight">{article.title}</h3>
                          {article.summary && (
                            <p className="mt-3 text-sm leading-[1.45] text-black/70 group-hover:text-white/75">
                              {article.summary}
                            </p>
                          )}
                        </div>
                         <span className="mt-4 inline-flex items-center text-xs font-bold tracking-[0.12em]">
                           read more
                          <ChevronRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
                        </span>
                      </Link>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
