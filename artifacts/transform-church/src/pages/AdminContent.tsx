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
import { useState, useEffect } from "react";
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
import { Plus, Trash2, Video, BookOpen, HelpCircle, Users, Pencil, Globe, Lock, Mail } from "lucide-react";
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
  if (res.status === 204) return null;
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
  const [isPublic, setIsPublic] = useState(true);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createModule({ data: { trackId, title, description: desc, order: parseInt(order), isPublic } }, {
      onSuccess: () => {
        toast({ title: "Module created" });
        setOpen(false); setTitle(""); setDesc(""); setOrder("1"); setIsPublic(true);
        queryClient.invalidateQueries({ queryKey: getListModulesQueryKey({ trackId }) });
      },
    });
  };

  const handleToggleVisibility = async (mod: any) => {
    setTogglingId(mod.id);
    try {
      await apiFetch(`/api/admin/modules/${mod.id}/visibility`, {
        method: "PATCH",
        body: JSON.stringify({ isPublic: !mod.isPublic }),
      });
      toast({ title: `Module set to ${!mod.isPublic ? "Public" : "Private"}` });
      queryClient.invalidateQueries({ queryKey: getListModulesQueryKey({ trackId }) });
    } catch {
      toast({ title: "Failed to update visibility", variant: "destructive" });
    } finally {
      setTogglingId(null);
    }
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
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsPublic(v => !v)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${isPublic ? "bg-primary" : "bg-muted-foreground/30"}`}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition-transform ${isPublic ? "translate-x-5" : "translate-x-0"}`} />
                </button>
                <span className="text-sm font-medium flex items-center gap-1.5">
                  {isPublic ? <Globe className="w-4 h-4 text-primary" /> : <Lock className="w-4 h-4 text-muted-foreground" />}
                  {isPublic ? "Public — visible to all students" : "Private — only visible when assigned"}
                </span>
              </div>
              <Button type="submit" className="w-full">Create Module</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {(modules as any[])?.sort((a, b) => a.order - b.order).map((mod: any) => (
        <div key={mod.id} className="border rounded-lg bg-background">
          <Accordion type="single" collapsible>
            <AccordionItem value={String(mod.id)} className="border-0">
              <AccordionTrigger className="px-4 py-3 hover:no-underline">
                <div className="flex items-center gap-2 text-left flex-1 min-w-0">
                  <Badge variant="outline" className="text-xs shrink-0">{mod.order}</Badge>
                  <span className="font-medium truncate">{mod.title}</span>
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); handleToggleVisibility(mod); }}
                    disabled={togglingId === mod.id}
                    className={`shrink-0 ml-auto mr-2 flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-colors ${
                      mod.isPublic
                        ? "border-primary/30 text-primary bg-primary/5 hover:bg-primary/10"
                        : "border-muted-foreground/30 text-muted-foreground bg-muted/30 hover:bg-muted/50"
                    }`}
                    title={mod.isPublic ? "Click to make private" : "Click to make public"}
                  >
                    {mod.isPublic
                      ? <><Globe className="w-3 h-3" /> Public</>
                      : <><Lock className="w-3 h-3" /> Private</>
                    }
                  </button>
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

type Group = { id: number; name: string; memberCount: number };

function AssignmentManager() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: users } = useAdminListUsers();
  const { data: modules } = useListModules(undefined, { query: { queryKey: getListModulesQueryKey() } });
  const [open, setOpen] = useState(false);
  const [assignTo, setAssignTo] = useState<"user" | "group">("user");
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("");
  const [selectedModule, setSelectedModule] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notifyEmail, setNotifyEmail] = useState(false);
  const [resetProgress, setResetProgress] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      apiFetch("/api/groups")
        .then(r => r?.json())
        .then(data => setGroups(data ?? []))
        .catch(() => {});
    }
  }, [open]);

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    const hasTarget = assignTo === "user" ? !!selectedUser : !!selectedGroup;
    if (!hasTarget || !selectedModule) {
      toast({ title: "Please select a target and module", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, any> = {
        moduleId: parseInt(selectedModule),
        dueDate: dueDate || null,
        notifyEmail,
        resetProgress,
      };
      if (assignTo === "user") {
        body.userIds = [selectedUser];
      } else {
        body.groupId = parseInt(selectedGroup);
      }
      await apiFetch("/api/admin/assignments", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const targetLabel = assignTo === "group"
        ? `group "${groups.find(g => String(g.id) === selectedGroup)?.name}"`
        : "user";
      const extras = [notifyEmail ? "email sent" : "", resetProgress ? "progress reset" : ""].filter(Boolean).join(", ");
      toast({ title: `Module assigned to ${targetLabel}${extras ? ` — ${extras}` : ""}` });
      setOpen(false);
      setSelectedUser(""); setSelectedGroup(""); setSelectedModule(""); setDueDate(""); setNotifyEmail(false); setResetProgress(false);
    } catch {
      toast({ title: "Failed to assign module", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline"><Users className="w-4 h-4 mr-2" /> Assign Module</Button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Assign Training Module</DialogTitle></DialogHeader>
          <form onSubmit={handleAssign} className="space-y-4">
            {/* Assign to: User or Group */}
            <div className="flex rounded-lg border border-input overflow-hidden">
              <button
                type="button"
                className={`flex-1 py-2 text-sm font-medium transition-colors ${assignTo === "user" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
                onClick={() => setAssignTo("user")}
              >
                Individual User
              </button>
              <button
                type="button"
                className={`flex-1 py-2 text-sm font-medium transition-colors ${assignTo === "group" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
                onClick={() => setAssignTo("group")}
              >
                Group
              </button>
            </div>

            {assignTo === "user" ? (
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
            ) : (
              <FormField label="Group">
                <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                  <SelectTrigger><SelectValue placeholder="Select a group..." /></SelectTrigger>
                  <SelectContent>
                    {groups.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground">No groups yet. Create one in Users &amp; Progress.</div>
                    ) : groups.map(g => (
                      <SelectItem key={g.id} value={String(g.id)}>
                        {g.name} ({g.memberCount} member{g.memberCount !== 1 ? "s" : ""})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            )}

            <FormField label="Module">
              <Select value={selectedModule} onValueChange={setSelectedModule}>
                <SelectTrigger><SelectValue placeholder="Select a module..." /></SelectTrigger>
                <SelectContent>
                  {(modules as any[])?.map((m: any) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      <span className="flex items-center gap-1.5">
                        {m.isPublic ? <Globe className="w-3 h-3 text-primary" /> : <Lock className="w-3 h-3 text-muted-foreground" />}
                        {m.title}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <FormField label="Due Date (optional)">
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </FormField>

            {/* Email notification toggle */}
            <div className="flex items-center gap-3 py-2 border-t border-border">
              <button
                type="button"
                onClick={() => setNotifyEmail(v => !v)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${notifyEmail ? "bg-primary" : "bg-muted-foreground/30"}`}
              >
                <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform ring-0 transition-transform ${notifyEmail ? "translate-x-4" : "translate-x-0"}`} />
              </button>
              <span className="text-sm flex items-center gap-1.5 text-muted-foreground">
                <Mail className="w-4 h-4" />
                {notifyEmail ? "Send email notification to assignee(s)" : "No email notification"}
              </span>
            </div>

            {/* Reset progress toggle */}
            <div className={`flex items-start gap-3 py-2 border-t border-border rounded-md transition-colors ${resetProgress ? "text-destructive" : ""}`}>
              <button
                type="button"
                onClick={() => setResetProgress(v => !v)}
                className={`mt-0.5 relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${resetProgress ? "bg-destructive" : "bg-muted-foreground/30"}`}
              >
                <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform ring-0 transition-transform ${resetProgress ? "translate-x-4" : "translate-x-0"}`} />
              </button>
              <div>
                <span className={`text-sm font-medium ${resetProgress ? "text-destructive" : "text-muted-foreground"}`}>
                  Reset quiz progress
                </span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {resetProgress
                    ? "Pass/fail record and attempts will be deleted — assignee(s) must retake the quiz."
                    : "Existing quiz results will be kept."}
                </p>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Assigning..." : "Assign Module"}
            </Button>
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
          <Card className="border-dashed bg-muted/10">
            <CardContent className="p-12 text-center">
              <BookOpen className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
              <h3 className="font-semibold text-lg mb-2">No tracks yet</h3>
              <p className="text-muted-foreground mb-6 text-sm">Create your first training track to get started.</p>
              <Button onClick={() => setAddTrackOpen(true)}><Plus className="w-4 h-4 mr-2" /> New Track</Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
