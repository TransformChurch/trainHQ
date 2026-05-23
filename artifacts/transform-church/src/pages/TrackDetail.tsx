import { useGetTrack } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, BookOpen, ChevronRight } from "lucide-react";

export default function TrackDetail() {
  const { trackId } = useParams();
  const { data: track, isLoading, error } = useGetTrack(Number(trackId), {
    query: {
      enabled: !!trackId,
      queryKey: ["getTrack", Number(trackId)],
    }
  });

  if (isLoading) {
    return <div className="p-8 text-center"><div className="animate-pulse h-8 bg-muted w-1/3 mx-auto rounded"></div></div>;
  }

  if (error || !track) {
    return <div className="p-8 text-center text-destructive">Track not found.</div>;
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <Link href="/tracks" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Tracks
        </Link>
        
        <div className="flex flex-col md:flex-row gap-8 items-start">
          {track.imageUrl ? (
            <img src={track.imageUrl} alt={track.name} className="w-full md:w-1/3 rounded-xl object-cover shadow-sm aspect-video md:aspect-square" />
          ) : (
            <div className="w-full md:w-1/3 rounded-xl bg-primary/10 text-primary flex items-center justify-center aspect-video md:aspect-square shadow-sm">
              <BookOpen className="w-16 h-16 opacity-50" />
            </div>
          )}
          
          <div className="flex-1 space-y-4">
            <h1 className="text-3xl md:text-4xl font-bold font-serif text-foreground">{track.name}</h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              {track.description || "A structured learning path for leadership development."}
            </p>
            <div className="inline-flex items-center rounded-full bg-secondary/10 px-3 py-1 text-sm font-medium text-secondary">
              {track.modules?.length || 0} Modules
            </div>
          </div>
        </div>
      </div>

      <div className="pt-8 border-t border-border">
        <h2 className="text-2xl font-bold mb-6">Modules in this Track</h2>
        
        {track.modules?.length === 0 ? (
          <div className="text-center py-12 bg-muted/20 rounded-xl border border-dashed">
            <p className="text-muted-foreground">No modules have been added to this track yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {track.modules?.sort((a, b) => a.order - b.order).map((module, index) => (
              <Card key={module.id} className="p-6 hover:border-primary/50 transition-colors group">
                <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                  <div className="flex gap-4 items-start">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-bold shrink-0 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                      {index + 1}
                    </div>
                    <div>
                      <h3 className="text-xl font-bold">{module.title}</h3>
                      <p className="text-muted-foreground mt-1 line-clamp-2 max-w-2xl">{module.description}</p>
                    </div>
                  </div>
                  <Link href={`/modules/${module.id}`} className="shrink-0 mt-4 md:mt-0 w-full md:w-auto">
                    <Button variant="secondary" className="w-full md:w-auto group-hover:bg-primary group-hover:text-primary-foreground">
                      Enter Module <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}