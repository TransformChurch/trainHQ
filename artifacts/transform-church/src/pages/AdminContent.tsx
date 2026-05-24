import {
  useListTracks, useCreateTrack, useUpdateTrack, useDeleteTrack,
  useListModules, useCreateModule, useUpdateModule, useDeleteModule,
  useListVideos, useCreateVideo, useUpdateVideo, useDeleteVideo,
  useCreateQuizQuestion, useDeleteQuizQuestion, useGetQuiz,
  useAdminListUsers, useCreateAssignment, useDeleteAssignment, useListMyAssignments,
  getListTracksQueryKey, getListModulesQueryKey, getListVideosQueryKey, getGetQuizQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Plus, Trash2, Video, BookOpen, HelpCircle, Users, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Video as VideoType, QuizQuestion } from "@workspace/api-client-react";

// ── Helpers ──────────────────────────────────────────────────────────────────

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...opts,
  });
  if (!res.ok) throw new Error(await res.text());
  return res;
}

// ── Edit Video Dialog ─────────────────────────────────────────────────────────

function EditVideoDialog({ video, moduleId, onSaved }: { video: VideoType; moduleId: number; onSaved: () => void }) {
  const { toast } = useToast();
  const { mutate: updateVideo } = useUpdateVideo();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(video.title);
  const [url, setUrl] = useState(video.url);
  const [desc, setDesc] = useState(video.description ?? "");
  const [duration, setDuration] = useState(video.durationSeconds ? String(video.durationSeconds) : "");
  const [order, setOrder] = useState(String(video.order));

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateVideo({
      videoId: video.id,
      data: {
        title,
        url,
        description: desc || null,
        durationSeconds: duration ? parseInt(duration) : null,
        order: parseInt(order),
      },
    }, {
      onSuccess: () => {
        toast({ title: "Video updated" });
        setOpen(false);
        onSaved();
      },
      onError: () => toast({ title: "Failed to update video", variant: "destructive" }),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => {
      setOpen(v);
      if (v) { setTitle(video.title); setUrl(video.url); setDesc(video.description ?? ""); setDuration(video.durationSeconds ? String(video.durationSeconds) : ""); setOrder(String(video.order)); }
    }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" title="Edit video">
          <Pencil className="w-3 h-3" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit Video</DialogTitle></DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          <FormField label="Title"><Input value={title} onChange={e => setTitle(e.target.value)} required /></FormField>
          <FormField label="Embed URL (YouTube/Vimeo)"><Input value={url} onChange={e => setUrl(e.target.value)} required /></FormField>
          <FormField label="Description"><Textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} /></FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Duration (seconds)"><Input type="number" value={duration} onChange={e => setDuration(e.target.value)} placeholder="600" /></FormField>
            <FormField label="Order"><Input type="number" value={order} onChange={e => setOrder(e.target.value)} min="1" /></FormField>
          </div>
          <Button type="submit" className="w-full">Save Changes</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit Question Dialog ──────────────────────────────────────────────────────

function EditQuestionDialog({ question, moduleId, onSaved }: { question: QuizQuestion; moduleId: number; onSaved: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [qText, setQText] = useState(question.questionText);
  const [options, setOptions] = useState<string[]>(question.options.length >= 2 ? [...question.options] : [...question.options, "", "", ""]);
  const [correctIndex, setCorrectIndex] = useState(String(question.correctIndex ?? 0));
  const [order, setOrder] = useState(String(question.order));
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const filledOptions = options.filter(o => o.trim());
    if (filledOptions.length < 2) {
      toast({ title: "Provide at least 2 options", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      await apiFetch(`/api/quizzes/questions/${question.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          questionText: qText,
          options: filledOptions,
          correctIndex: parseInt(correctIndex),
          order: parseInt(order),
        }),
      });
      toast({ title: "Question updated" });
      setOpen(false);
      onSaved();
    } catch {
      toast({ title: "Failed to update question", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const syncState = () => {
    setQText(question.questionText);
    const padded = [...question.options];
    while (padded.length < 4) padded.push("");
    setOptions(padded);
    setCorrectIndex(String(question.correctIndex ?? 0));
    setOrder(String(question.order));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) syncState(); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" title="Edit question">
          <Pencil className="w-3 h-3" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Edit Quiz Question</DialogTitle></DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          <FormField label="Question"><Textarea value={qText} onChange={e => setQText(e.target.value)} rows={2} required /></FormField>
          <div className="space-y-2">
            <Label>Answer Options (select correct)</Label>
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="radio" name="correct-edit" value={i}
                  checked={correctIndex === String(i)}
                  onChange={() => setCorrectIndex(String(i))}
                  className="accent-primary"
                  title={`Mark option ${i + 1} as correct`}
                />
                <Input
                  value={opt}
                  placeholder={`Option ${i + 1}`}
                  onChange={e => { const n = [...options]; n[i] = e.target.value; setOptions(n); }}
                />
              </div>
            ))}
            <p className="text-xs text-muted-foreground">Select the radio button next to the correct answer.</p>
          </div>
          <FormField label="Order"><Input type="number" value={order} onChange={e => setOrder(e.target.value)} min="1" /></FormField>
          <Button type="submit" className="w-full" disabled={saving}>{saving ? "Saving..." : "Save Changes"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Module manager (inside a track) ─────────────────────────────────────────

function ModuleManager({ trackId }: { trackId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: modules } = useListModules({ trackId }, { query: { queryKey: getListModulesQueryKey({ trackId }) } });
  const { mutate: createModule } = useCreateModule();
  const { mutate: deleteModule } = useDeleteModule();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [order, setOrder] = useState("1");

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createModule({ data: { trackId, title, description: desc, order: parseInt(order) } }, {
      onSuccess: () => {
        toast({ title: "Module created" });
        setOpen(false); setTitle(""); setDesc(""); setOrder("1");
        queryClient.invalidateQueries({ queryKey: getListModulesQueryKey({ trackId }) });
      },
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
          <BookOpen className="w-3.5 h-3.5" /> Modules ({modules?.length ?? 0})
        </span>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline"><Plus className="w-3.5 h-3.5 mr-1" /> Add Module</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Module</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <FormField label="Title"><Input value={title} onChange={e => setTitle(e.target.value)} required /></FormField>
              <FormField label="Description"><Textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} /></FormField>
              <FormField label="Order"><Input type="number" value={order} onChange={e => setOrder(e.target.value)} min="1" /></FormField>
              <Button type="submit" className="w-full">Create Module</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {modules?.sort((a, b) => a.order - b.order).map(mod => (
        <div key={mod.id} className="border rounded-lg bg-background">
          <Accordion type="single" collapsible>
            <AccordionItem value={String(mod.id)} className="border-0">
              <AccordionTrigger className="px-4 py-3 hover:no-underline">
                <div className="flex items-center gap-2 text-left">
                  <Badge variant="outline" className="text-xs">{mod.order}</Badge>
                  <span className="font-medium">{mod.title}</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-3 space-y-3">
                <VideoManager moduleId={mod.id} />
                <QuizManager moduleId={mod.id} />
                <Button
                  variant="ghost" size="sm"
                  className="text-destructive hover:text-destructive w-full justify-start"
                  onClick={() => {
                    if (confirm("Delete this module and all its content?")) {
                      deleteModule({ moduleId: mod.id }, {
                        onSuccess: () => {
                          toast({ title: "Module deleted" });
                          queryClient.invalidateQueries({ queryKey: getListModulesQueryKey({ trackId }) });
                        },
                      });
                    }
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete Module
                </Button>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      ))}
      {modules?.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-3 border border-dashed rounded">No modules yet.</p>
      )}
    </div>
  );
}

// ── Video manager (inside a module) ─────────────────────────────────────────

function VideoManager({ moduleId }: { moduleId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: videos } = useListVideos({ moduleId }, { query: { queryKey: getListVideosQueryKey({ moduleId }) } });
  const { mutate: createVideo } = useCreateVideo();
  const { mutate: deleteVideo } = useDeleteVideo();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [desc, setDesc] = useState("");
  const [duration, setDuration] = useState("");
  const [order, setOrder] = useState("1");

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createVideo({
      data: { moduleId, title, url, description: desc, durationSeconds: duration ? parseInt(duration) : undefined, order: parseInt(order) }
    }, {
      onSuccess: () => {
        toast({ title: "Video added" });
        setOpen(false); setTitle(""); setUrl(""); setDesc(""); setDuration(""); setOrder("1");
        queryClient.invalidateQueries({ queryKey: getListVideosQueryKey({ moduleId }) });
      },
    });
  };

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListVideosQueryKey({ moduleId }) });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <Video className="w-3 h-3" /> Videos ({videos?.length ?? 0})
        </span>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="ghost" className="h-7 text-xs"><Plus className="w-3 h-3 mr-1" /> Add Video</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Video</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <FormField label="Title"><Input value={title} onChange={e => setTitle(e.target.value)} required /></FormField>
              <FormField label="Embed URL (YouTube/Vimeo)"><Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://www.youtube.com/embed/..." required /></FormField>
              <FormField label="Description"><Textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} /></FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Duration (seconds)"><Input type="number" value={duration} onChange={e => setDuration(e.target.value)} placeholder="600" /></FormField>
                <FormField label="Order"><Input type="number" value={order} onChange={e => setOrder(e.target.value)} min="1" /></FormField>
              </div>
              <Button type="submit" className="w-full">Add Video</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      {videos?.sort((a, b) => a.order - b.order).map(v => (
        <div key={v.id} className="flex items-center justify-between bg-muted/30 rounded px-3 py-2">
          <span className="text-sm truncate max-w-[70%]">{v.order}. {v.title}</span>
          <div className="flex items-center gap-1 shrink-0">
            <EditVideoDialog video={v} moduleId={moduleId} onSaved={invalidate} />
            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive"
              onClick={() => deleteVideo({ videoId: v.id }, { onSuccess: () => {
                toast({ title: "Video removed" });
                invalidate();
              }})}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Quiz question manager ─────────────────────────────────────────────────────

function QuizManager({ moduleId }: { moduleId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: questions } = useGetQuiz(moduleId, { query: { queryKey: getGetQuizQueryKey(moduleId) } });
  const { mutate: createQuestion } = useCreateQuizQuestion();
  const { mutate: deleteQuestion } = useDeleteQuizQuestion();

  const [open, setOpen] = useState(false);
  const [qText, setQText] = useState("");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [correctIndex, setCorrectIndex] = useState("0");
  const [order, setOrder] = useState("1");

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const filledOptions = options.filter(o => o.trim());
    if (filledOptions.length < 2) {
      toast({ title: "Provide at least 2 options", variant: "destructive" }); return;
    }
    createQuestion({
      moduleId,
      data: { questionText: qText, options: filledOptions, correctIndex: parseInt(correctIndex), order: parseInt(order) }
    }, {
      onSuccess: () => {
        toast({ title: "Question added" });
        setOpen(false); setQText(""); setOptions(["", "", "", ""]); setCorrectIndex("0"); setOrder("1");
        queryClient.invalidateQueries({ queryKey: getGetQuizQueryKey(moduleId) });
      },
    });
  };

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetQuizQueryKey(moduleId) });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <HelpCircle className="w-3 h-3" /> Quiz Questions ({questions?.length ?? 0})
        </span>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="ghost" className="h-7 text-xs"><Plus className="w-3 h-3 mr-1" /> Add Question</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Add Quiz Question</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <FormField label="Question"><Textarea value={qText} onChange={e => setQText(e.target.value)} rows={2} required /></FormField>
              <div className="space-y-2">
                <Label>Answer Options (mark correct)</Label>
                {options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="radio" name="correct" value={i}
                      checked={correctIndex === String(i)}
                      onChange={() => setCorrectIndex(String(i))}
                      className="accent-primary"
                      title={`Mark option ${i + 1} as correct`}
                    />
                    <Input
                      value={opt} placeholder={`Option ${i + 1}`}
                      onChange={e => { const n = [...options]; n[i] = e.target.value; setOptions(n); }}
                    />
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">Select the radio button next to the correct answer.</p>
              </div>
              <FormField label="Order"><Input type="number" value={order} onChange={e => setOrder(e.target.value)} min="1" /></FormField>
              <Button type="submit" className="w-full">Add Question</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      {questions?.map((q, i) => (
        <div key={q.id} className="flex items-start justify-between bg-muted/30 rounded px-3 py-2 gap-2">
          <span className="text-xs truncate max-w-[75%]">{i + 1}. {q.questionText}</span>
          <div className="flex items-center gap-1 shrink-0">
            <EditQuestionDialog question={q} moduleId={moduleId} onSaved={invalidate} />
            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive"
              onClick={() => deleteQuestion({ questionId: q.id }, { onSuccess: () => {
                toast({ title: "Question removed" });
                invalidate();
              }})}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Assignment manager ────────────────────────────────────────────────────────

function AssignmentManager() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: users } = useAdminListUsers();
  const { data: modules } = useListModules(undefined, { query: { queryKey: getListModulesQueryKey() } });
  const { mutate: createAssignment } = useCreateAssignment();
  const [open, setOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedModule, setSelectedModule] = useState("");
  const [dueDate, setDueDate] = useState("");

  const handleAssign = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !selectedModule) { toast({ title: "Select a user and module", variant: "destructive" }); return; }
    createAssignment({
      data: { userIds: [selectedUser], moduleId: parseInt(selectedModule), dueDate: dueDate || null }
    }, {
      onSuccess: () => {
        toast({ title: "Module assigned successfully" });
        setOpen(false); setSelectedUser(""); setSelectedModule(""); setDueDate("");
      },
    });
  };

  return (
    <div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline"><Users className="w-4 h-4 mr-2" /> Assign Module to User</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign Training Module</DialogTitle></DialogHeader>
          <form onSubmit={handleAssign} className="space-y-4">
            <FormField label="Student">
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger><SelectValue placeholder="Select a student..." /></SelectTrigger>
                <SelectContent>
                  {users?.filter(u => u.role === "student").map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.firstName} {u.lastName} ({u.email})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Module">
              <Select value={selectedModule} onValueChange={setSelectedModule}>
                <SelectTrigger><SelectValue placeholder="Select a module..." /></SelectTrigger>
                <SelectContent>
                  {modules?.map(m => (
                    <SelectItem key={m.id} value={String(m.id)}>{m.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Due Date (optional)">
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </FormField>
            <Button type="submit" className="w-full">Assign Module</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminContent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: tracks, isLoading } = useListTracks();
  const { mutate: createTrack } = useCreateTrack();
  const { mutate: deleteTrack } = useDeleteTrack();

  const [addTrackOpen, setAddTrackOpen] = useState(false);
  const [trackName, setTrackName] = useState("");
  const [trackDesc, setTrackDesc] = useState("");

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading content...</div>;

  const handleCreateTrack = (e: React.FormEvent) => {
    e.preventDefault();
    createTrack({ data: { name: trackName, description: trackDesc } }, {
      onSuccess: () => {
        toast({ title: "Track created" });
        setAddTrackOpen(false); setTrackName(""); setTrackDesc("");
        queryClient.invalidateQueries({ queryKey: getListTracksQueryKey() });
      },
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-serif">Content Manager</h1>
          <p className="text-muted-foreground mt-2">Manage tracks, modules, videos, quiz questions, and assignments.</p>
        </div>
        <div className="flex items-center gap-2">
          <AssignmentManager />
          <Dialog open={addTrackOpen} onOpenChange={setAddTrackOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-2" /> New Track</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Training Track</DialogTitle></DialogHeader>
              <form onSubmit={handleCreateTrack} className="space-y-4">
                <FormField label="Track Name"><Input value={trackName} onChange={e => setTrackName(e.target.value)} required /></FormField>
                <FormField label="Description"><Textarea value={trackDesc} onChange={e => setTrackDesc(e.target.value)} rows={3} /></FormField>
                <Button type="submit" className="w-full">Create Track</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="space-y-4">
        {tracks?.map(track => (
          <Card key={track.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-xl">{track.name}</CardTitle>
                  {track.description && <p className="text-sm text-muted-foreground mt-1">{track.description}</p>}
                </div>
                <Button
                  variant="ghost" size="sm"
                  className="text-destructive hover:text-destructive shrink-0"
                  onClick={() => {
                    if (confirm(`Delete "${track.name}"? This will remove all modules, videos and quiz questions inside it.`)) {
                      deleteTrack({ trackId: track.id }, {
                        onSuccess: () => {
                          toast({ title: "Track deleted" });
                          queryClient.invalidateQueries({ queryKey: getListTracksQueryKey() });
                        },
                      });
                    }
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ModuleManager trackId={track.id} />
            </CardContent>
          </Card>
        ))}
        {tracks?.length === 0 && (
          <div className="text-center py-16 border border-dashed rounded-xl bg-muted/10">
            <p className="text-muted-foreground">No training tracks yet. Create your first one above.</p>
          </div>
        )}
      </div>
    </div>
  );
}
