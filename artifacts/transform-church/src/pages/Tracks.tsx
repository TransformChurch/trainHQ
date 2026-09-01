import { useListTracks } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, Layers } from "lucide-react";
import { Link } from "wouter";
import { StorageImage } from "@/lib/storageUrl";
import { useSiteCopy } from "@/lib/siteCopy";

export default function Tracks() {
  const { copy } = useSiteCopy();
  const { data: tracks, isLoading } = useListTracks();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="h-8 bg-muted rounded w-1/4 mb-2"></div>
          <div className="h-4 bg-muted rounded w-2/4"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-64 bg-muted rounded-xl animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold font-serif text-foreground">{copy("page.trainingTracksTitle")}</h1>
        <p className="text-muted-foreground mt-2 text-lg">Curated paths to equip you for ministry.</p>
      </div>

      {tracks?.length === 0 ? (
        <div className="text-center py-16 bg-muted/20 rounded-xl border border-dashed">
          <Layers className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground">No tracks available yet</h3>
          <p className="text-muted-foreground mt-1">Check back later for new training content.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tracks?.map(track => (
            <Card key={track.id} className="flex flex-col overflow-hidden hover:shadow-md transition-shadow">
              <div className="h-40 bg-muted relative">
                {track.imageUrl ? (
                  <StorageImage src={track.imageUrl} alt={track.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-primary/10 text-primary">
                    <BookOpen className="w-12 h-12 opacity-50" />
                  </div>
                )}
              </div>
              <CardHeader>
                <CardTitle className="line-clamp-1">{track.name}</CardTitle>
                <CardDescription className="line-clamp-2 mt-2 h-10">
                  {track.description || "No description provided."}
                </CardDescription>
              </CardHeader>
              <CardContent className="mt-auto pt-0">
                <Link href={`/tracks/${track.id}`} className="block w-full">
                  <Button className="w-full" variant="outline">View Modules</Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}