import { useListQueue, useRemoveFromQueue, getListQueueQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { BookmarkMinus, PlayCircle, Clock } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function Queue() {
  const { data: queueItems, isLoading } = useListQueue();
  const { mutate: removeFromQueue } = useRemoveFromQueue();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  if (isLoading) return <div className="p-8 text-center animate-pulse bg-muted h-8 w-1/3 mx-auto"></div>;

  const handleRemove = (videoId: number) => {
    removeFromQueue({ videoId }, {
      onSuccess: () => {
        toast({ title: "Removed from queue" });
        queryClient.invalidateQueries({ queryKey: getListQueueQueryKey() });
      }
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold font-serif">My Queue</h1>
        <p className="text-muted-foreground mt-2">Videos you've saved to watch later.</p>
      </div>

      {!queueItems || queueItems.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-xl bg-muted/10">
          <Clock className="w-12 h-12 mx-auto text-muted-foreground mb-4 opacity-50" />
          <h3 className="text-lg font-medium">Your queue is empty</h3>
          <p className="text-muted-foreground mt-1 mb-4">Save videos as you browse to watch them later.</p>
          <Link href="/tracks"><Button>Browse Tracks</Button></Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {queueItems.map(item => (
            <Card key={item.id} className="overflow-hidden hover:shadow-md transition-all">
              <div className="relative aspect-video bg-muted">
                {item.video.thumbnailUrl ? (
                  <img src={item.video.thumbnailUrl} alt={item.video.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="flex items-center justify-center w-full h-full text-muted-foreground">
                    <PlayCircle className="w-12 h-12 opacity-50" />
                  </div>
                )}
                <div className="absolute top-2 right-2">
                  <Button size="icon" variant="secondary" className="h-8 w-8 rounded-full shadow-sm hover:text-destructive" onClick={() => handleRemove(item.videoId)}>
                    <BookmarkMinus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <CardContent className="p-4">
                <h3 className="font-bold line-clamp-1 mb-1">{item.video.title}</h3>
                <p className="text-sm text-muted-foreground line-clamp-2 mb-4 h-10">{item.video.description}</p>
                <Link href={`/watch/${item.videoId}`} className="block">
                  <Button className="w-full">Watch Now</Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}