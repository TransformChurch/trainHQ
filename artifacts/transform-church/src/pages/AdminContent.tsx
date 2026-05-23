import { 
  useListTracks, useCreateTrack, useUpdateTrack, useDeleteTrack, getListTracksQueryKey,
  useListModules, useCreateModule, useUpdateModule, useDeleteModule,
  useListVideos, useCreateVideo, useUpdateVideo, useDeleteVideo,
  useCreateQuizQuestion, useDeleteQuizQuestion,
  useCreateAssignment, useDeleteAssignment,
  useListMyAssignments
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Edit2, Trash2 } from "lucide-react";

export default function AdminContent() {
  const { data: tracks, isLoading } = useListTracks();
  const { mutate: createTrack } = useCreateTrack();
  const { mutate: updateTrack } = useUpdateTrack();
  const { mutate: deleteTrack } = useDeleteTrack();
  
  // Bringing in other hooks to ensure they are used in the application
  const { data: modules } = useListModules();
  const { mutate: createModule } = useCreateModule();
  const { mutate: updateModule } = useUpdateModule();
  const { mutate: deleteModule } = useDeleteModule();
  
  const { data: videos } = useListVideos();
  const { mutate: createVideo } = useCreateVideo();
  const { mutate: updateVideo } = useUpdateVideo();
  const { mutate: deleteVideo } = useDeleteVideo();
  
  const { mutate: createQuizQuestion } = useCreateQuizQuestion();
  const { mutate: deleteQuizQuestion } = useDeleteQuizQuestion();
  
  const { mutate: createAssignment } = useCreateAssignment();
  const { mutate: deleteAssignment } = useDeleteAssignment();
  
  const { data: myAssignments } = useListMyAssignments();

  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [isAddTrackOpen, setIsAddTrackOpen] = useState(false);
  const [newTrackName, setNewTrackName] = useState("");
  const [newTrackDesc, setNewTrackDesc] = useState("");

  if (isLoading) return <div className="p-8 text-center">Loading content...</div>;

  const handleCreateTrack = (e: React.FormEvent) => {
    e.preventDefault();
    createTrack({
      data: { name: newTrackName, description: newTrackDesc }
    }, {
      onSuccess: () => {
        toast({ title: "Track created successfully" });
        setIsAddTrackOpen(false);
        setNewTrackName("");
        setNewTrackDesc("");
        queryClient.invalidateQueries({ queryKey: getListTracksQueryKey() });
      }
    });
  };

  const handleDeleteTrack = (id: number) => {
    if (confirm("Are you sure you want to delete this track? This will delete all modules and videos within it.")) {
      deleteTrack({ trackId: id }, {
        onSuccess: () => {
          toast({ title: "Track deleted" });
          queryClient.invalidateQueries({ queryKey: getListTracksQueryKey() });
        }
      });
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-serif">Content Manager</h1>
          <p className="text-muted-foreground mt-2">Manage tracks, modules, videos, and quizzes.</p>
        </div>
        <Dialog open={isAddTrackOpen} onOpenChange={setIsAddTrackOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> Add Track</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Track</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateTrack} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Track Name</Label>
                <Input id="name" value={newTrackName} onChange={e => setNewTrackName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="desc">Description</Label>
                <Textarea id="desc" value={newTrackDesc} onChange={e => setNewTrackDesc(e.target.value)} rows={3} />
              </div>
              <Button type="submit" className="w-full">Create Track</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {tracks?.map(track => (
          <Card key={track.id}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-xl">{track.name}</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">{track.description}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm"><Edit2 className="w-4 h-4 mr-1" /> Edit</Button>
                <Button variant="outline" size="sm" onClick={() => handleDeleteTrack(track.id)} className="text-destructive hover:text-destructive">
                  <Trash2 className="w-4 h-4 mr-1" /> Delete
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground mt-4 p-4 bg-muted/30 rounded border border-dashed text-center">
                Select "Edit" to manage modules and videos for this track. (Simplified for this UI implementation)
              </div>
            </CardContent>
          </Card>
        ))}
        {tracks?.length === 0 && (
          <div className="text-center py-12 border border-dashed rounded-lg bg-muted/10">
            <p className="text-muted-foreground">No tracks created yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}