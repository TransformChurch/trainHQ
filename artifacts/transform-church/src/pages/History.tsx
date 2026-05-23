import { useListWatchHistory } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { History as HistoryIcon, PlayCircle, CheckCircle2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export default function History() {
  const { data: historyItems, isLoading } = useListWatchHistory();

  if (isLoading) return <div className="p-8 text-center animate-pulse bg-muted h-8 w-1/3 mx-auto"></div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold font-serif">Watch History</h1>
        <p className="text-muted-foreground mt-2">Resume where you left off or review past videos.</p>
      </div>

      {!historyItems || historyItems.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-xl bg-muted/10">
          <HistoryIcon className="w-12 h-12 mx-auto text-muted-foreground mb-4 opacity-50" />
          <h3 className="text-lg font-medium">No watch history</h3>
          <p className="text-muted-foreground mt-1 mb-4">You haven't watched any videos yet.</p>
          <Link href="/tracks"><Button>Start Learning</Button></Link>
        </div>
      ) : (
        <div className="space-y-4">
          {historyItems.map(item => (
            <Card key={item.id} className="hover:border-primary/30 transition-colors overflow-hidden">
              <div className="flex flex-col sm:flex-row">
                <div className="w-full sm:w-48 aspect-video sm:aspect-auto bg-muted relative shrink-0">
                  {item.video.thumbnailUrl ? (
                    <img src={item.video.thumbnailUrl} alt={item.video.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex items-center justify-center w-full h-full text-muted-foreground">
                      <PlayCircle className="w-8 h-8 opacity-50" />
                    </div>
                  )}
                  {item.completed && (
                    <div className="absolute top-2 right-2 bg-background/80 rounded-full p-1 text-green-600 backdrop-blur-sm">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                  )}
                </div>
                <CardContent className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-lg">{item.video.title}</h3>
                    <p className="text-xs text-muted-foreground mb-3">
                      Last watched: {new Date(item.lastWatchedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-4 mt-2">
                    <div className="flex-1 max-w-xs">
                      <div className="flex justify-between text-xs mb-1">
                        <span>{Math.round(item.progressPercent)}%</span>
                        {item.completed && <span className="text-green-600 font-medium">Completed</span>}
                      </div>
                      <Progress value={item.progressPercent} className="h-1.5" />
                    </div>
                    <Link href={`/watch/${item.videoId}`}>
                      <Button variant="secondary" size="sm">
                        {item.completed ? 'Watch Again' : 'Resume'}
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}