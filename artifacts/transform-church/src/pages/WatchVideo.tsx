import { useGetVideo, useUpsertWatchProgress, useAddToQueue, useRemoveFromQueue, getGetVideoQueryKey, useListQueue } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Clock, CheckCircle2, BookmarkPlus, BookmarkMinus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function WatchVideo() {
  const { videoId: videoIdStr } = useParams();
  const videoId = Number(videoIdStr);
  const { data: video, isLoading } = useGetVideo(videoId, {
    query: { enabled: !!videoId, queryKey: getGetVideoQueryKey(videoId) }
  });
  
  const { mutate: upsertProgress } = useUpsertWatchProgress();
  const { mutate: addToQueue } = useAddToQueue();
  const { mutate: removeFromQueue } = useRemoveFromQueue();
  const { data: queue } = useListQueue();
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const inQueue = queue?.some(q => q.videoId === videoId);

  // A real implementation would use the YouTube/Vimeo player API to track time
  // Here we simulate progress when the user clicks a button
  const handleMarkComplete = () => {
    upsertProgress({
      videoId,
      data: { progressPercent: 100, completed: true }
    }, {
      onSuccess: () => {
        toast({ title: "Video marked as completed" });
        queryClient.invalidateQueries({ queryKey: getGetVideoQueryKey(videoId) });
      }
    });
  };

  const handleToggleQueue = () => {
    if (inQueue) {
      removeFromQueue({ videoId }, {
        onSuccess: () => {
          toast({ title: "Removed from queue" });
          queryClient.invalidateQueries({ queryKey: ['/api/queue'] });
        }
      });
    } else {
      addToQueue({ videoId }, {
        onSuccess: () => {
          toast({ title: "Added to queue" });
          queryClient.invalidateQueries({ queryKey: ['/api/queue'] });
        }
      });
    }
  };

  if (isLoading || !video) {
    return <div className="p-8 text-center">Loading video...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500">
      <Link href={`/modules/${video.moduleId}`} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to Module
      </Link>
      
      <div className="space-y-4">
        <h1 className="text-2xl md:text-3xl font-bold font-serif text-foreground">{video.title}</h1>
        
        <div className="aspect-video bg-black rounded-xl overflow-hidden shadow-lg border border-border">
          {video.url.includes("youtube.com") || video.url.includes("vimeo.com") ? (
            <iframe 
              src={video.url} 
              className="w-full h-full border-0" 
              allowFullScreen 
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-white/50 bg-slate-900">
              <p>Video Embed Placeholder</p>
              <p className="text-xs mt-2 font-mono">{video.url}</p>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-muted/30 rounded-xl border border-border">
          <div className="flex items-center gap-4">
            <Button onClick={handleMarkComplete} variant="outline" className="text-primary hover:text-primary">
              Mark as Completed
            </Button>
            {video.durationSeconds && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Clock className="w-4 h-4" /> 
                {Math.floor(video.durationSeconds / 60)}:{String(video.durationSeconds % 60).padStart(2, '0')}
              </div>
            )}
          </div>
          
          <Button onClick={handleToggleQueue} variant="ghost" size="sm" className={inQueue ? "text-primary" : "text-muted-foreground"}>
            {inQueue ? (
              <><BookmarkMinus className="w-4 h-4 mr-2" /> Remove from Queue</>
            ) : (
              <><BookmarkPlus className="w-4 h-4 mr-2" /> Save for Later</>
            )}
          </Button>
        </div>
        
        <div className="prose max-w-none dark:prose-invert">
          <p>{video.description}</p>
        </div>
      </div>
    </div>
  );
}