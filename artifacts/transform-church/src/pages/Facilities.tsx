import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Building2,
  ClipboardList,
  Coffee,
  ExternalLink,
  Headphones,
  Loader2,
  Megaphone,
  Monitor,
  Truck,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { facilitiesApi, type FacilitiesCategory } from "@/lib/facilities";

const iconMap = {
  wrench: Wrench,
  "alert-triangle": AlertTriangle,
  building: Building2,
  truck: Truck,
  coffee: Coffee,
  megaphone: Megaphone,
  monitor: Monitor,
  headphones: Headphones,
  clipboard: ClipboardList,
};

export default function Facilities() {
  const [categories, setCategories] = useState<FacilitiesCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    facilitiesApi<FacilitiesCategory[]>("/api/facilities")
      .then(setCategories)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Loading Facilities" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-xl py-24 text-center">
        <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-amber-500" />
        <h1 className="text-2xl font-bold">Facilities is not available</h1>
        <p className="mt-2 text-muted-foreground">{error}</p>
      </div>
    );
  }

  const visibleCategories = categories.filter((category) => category.requests.length > 0);

  return (
    <div className="-m-4 min-h-screen bg-[#f1f1ef] text-[#242424] md:-m-8">
      <header className="bg-[#0c0c0c] px-6 py-10 text-white md:px-12 md:py-16 lg:px-16 lg:py-20">
        <div className="mx-auto max-w-5xl">
          <p className="text-sm font-bold uppercase tracking-[0.12em] md:text-base">
            Transform Church <span className="font-normal text-white/55">Facilities</span>
          </p>
          <div className="mt-14 max-w-2xl md:mt-20">
            <h1 className="text-4xl font-black uppercase leading-[0.95] tracking-tight sm:text-5xl md:text-6xl">
              Where does this<br />request go?
            </h1>
            <p className="mt-6 max-w-xl text-base leading-6 text-white/60 md:text-lg md:leading-7">
              One page, a few clear doors. Pick the closest match below and you&apos;ll land on the
              right form. It still goes straight into the right team&apos;s tracking, so there&apos;s
              nothing new to learn.
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16">
        {visibleCategories.length > 1 && (
          <nav className="mb-12 flex flex-wrap gap-2" aria-label="Request categories">
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
            <ClipboardList className="mx-auto h-9 w-9 text-black/35" />
            <h2 className="mt-4 text-xl font-bold">No request forms are available yet</h2>
            <p className="mt-2 text-sm text-black/55">Please check back later or contact an administrator.</p>
          </div>
        ) : (
          <div className="space-y-16">
            {visibleCategories.map((category) => (
              <section key={category.id} id={`category-${category.id}`} className="scroll-mt-6">
                <div className="mb-6 border-b border-black/20 pb-4">
                  <h2 className="text-2xl font-black uppercase tracking-tight md:text-3xl">{category.name}</h2>
                  {category.description && (
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-black/60">{category.description}</p>
                  )}
                </div>
                <div className="grid border-l border-t border-black/15 md:grid-cols-2 xl:grid-cols-3">
                  {category.requests.map((request) => {
                    const Icon = iconMap[request.icon as keyof typeof iconMap] ?? ClipboardList;
                    return (
                      <article
                        key={request.id}
                        className="flex min-h-[360px] flex-col border-b border-r border-black/15 bg-white p-6 md:p-7"
                        data-testid={`facilities-request-${request.id}`}
                      >
                        <div className="flex h-11 w-11 items-center justify-center border border-black">
                          <Icon className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />
                        </div>
                        {request.eyebrow && (
                          <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.16em] text-[#6d7682]">
                            {request.eyebrow}
                          </p>
                        )}
                        <h3 className="mt-3 text-xl font-black uppercase leading-6 tracking-tight">
                          {request.title}
                        </h3>
                        <p className="mt-3 text-[15px] leading-[1.45] text-black/80">{request.description}</p>
                        {request.useWhen && (
                          <p className="mt-4 border-l-2 border-black/10 pl-3 text-sm leading-5 text-black/75">
                            <strong className="text-black">Use this when:</strong> {request.useWhen}
                          </p>
                        )}
                        <Button asChild variant="outline" className="mt-auto w-fit rounded-none border-black px-5 text-xs font-bold uppercase tracking-[0.12em] hover:bg-black hover:text-white">
                          <a href={request.url} target="_blank" rel="noopener noreferrer">
                            {request.buttonLabel}
                            <ExternalLink className="ml-2 h-3.5 w-3.5" aria-hidden="true" />
                          </a>
                        </Button>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

        <aside className="mt-14 border-t border-black/20 pt-6 text-sm leading-6 text-black/65">
          <strong className="text-black">Not sure which one?</strong> Repairs vs. damage is the fuzziest
          call. If it wore out, it&apos;s Maintenance &amp; Repair; if something happened to it, it&apos;s
          a Damage Report. When in doubt, pick Maintenance &amp; Repair. Facilities will re-route it if needed.
        </aside>
      </main>
    </div>
  );
}