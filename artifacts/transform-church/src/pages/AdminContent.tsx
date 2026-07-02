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
import { useState, useEffect, useRef, createContext, useContext } from "react";
import { useUser } from "@clerk/react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Video, BookOpen, HelpCircle, Users, Pencil, Globe, Lock, Mail, Upload, Link, HardDrive, Image as ImageIcon, FileText, FolderOpen, Shield, X, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useUpload } from "@workspace/object-storage-web";
import type { Video as VideoType, QuizQuestion } from "@workspace/api-client-react";
import { resolveStorageUrl } from "@/lib/storageUrl";

type VideoSourceType = "embed" | "drive" | "upload";

function convertDriveUrl(input: string): string {
  const fileIdMatch = input.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (fileIdMatch) {
    return `https://drive.google.com/file/d/${fileIdMatch[1]}/preview`;
  }
  return input;
}

function VideoSourcePicker({
  sourceType,
  onSourceChange,
  url,
  onUrlChange,
  onUploadComplete,
}: {
  sourceType: VideoSourceType;
  onSourceChange: (t: VideoSourceType) => void;
  url: string;
  onUrlChange: (u: string) => void;
  onUploadComplete: (objectPath: string) => void;
}) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [maxSizeMb, setMaxSizeMb] = useState(500);
  const [uploadEnabled, setUploadEnabled] = useState(true);
  const [driveFolderUrl, setDriveFolderUrl] = useState("");
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

  useEffect(() => {
    fetch(`${BASE}/api/admin/settings`, { credentials: "include" })
      .then(r => r.json())
      .then((rows: { key: string; value: string }[]) => {
        const s = rows?.find(r => r.key === "max_video_upload_size_mb");
        if (s) setMaxSizeMb(parseInt(s.value));
        const enabled = rows?.find(r => r.key === "video_upload_enabled");
        if (enabled) setUploadEnabled(enabled.value !== "false");
        const folder = rows?.find(r => r.key === "drive_upload_folder_url");
        if (folder?.value) setDriveFolderUrl(folder.value);
      })
      .catch(() => {});
  }, []);

  const { uploadFile, isUploading, progress } = useUpload({
    basePath: `${BASE}/api/storage`,
    onSuccess: (response) => {
      onUploadComplete(response.objectPath);
      onUrlChange(response.objectPath);
      toast({ title: "Video uploaded successfully" });
    },
    onError: (err) => {
      toast({ title: err.message || "Upload failed", variant: "destructive" });
    },
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const maxBytes = maxSizeMb * 1024 * 1024;
    if (file.size > maxBytes) {
      toast({ title: `File too large. Maximum allowed size is ${maxSizeMb} MB.`, variant: "destructive" });
      return;
    }
    await uploadFile(file);
  };

  return (
    <div className="space-y-3">
      <Label>Video Source</Label>
      <div className="flex rounded-lg border border-input overflow-hidden text-sm">
        {(["embed", "drive", "upload"] as VideoSourceType[])
          .filter(type => type !== "upload" || uploadEnabled)
          .map((type) => {
            const labels: Record<VideoSourceType, { label: string; Icon: React.FC<{ className?: string }> }> = {
              embed: { label: "YouTube / Vimeo", Icon: Link },
              drive: { label: "Google Drive", Icon: HardDrive },
              upload: { label: "Upload File", Icon: Upload },
            };
            const { label, Icon } = labels[type];
            return (
              <button
                key={type}
                type="button"
                onClick={() => onSourceChange(type)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-1 font-medium transition-colors ${sourceType === type ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            );
          })}
      </div>
      {!uploadEnabled && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Lock className="w-3 h-3" /> Direct upload is disabled. Enable it in Admin Settings.
        </p>
      )}

      {sourceType === "embed" && (
        <div className="space-y-1.5">
          <Label>Embed URL</Label>
          <Input
            value={url}
            onChange={e => onUrlChange(e.target.value)}
            placeholder="https://www.youtube.com/embed/..."
            required
          />
        </div>
      )}

      {sourceType === "drive" && (
        <div className="space-y-2.5">
          {/* Step 1 */}
          <div className="flex gap-3 items-start rounded-lg border border-border bg-muted/20 p-3">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">1</div>
            <div className="space-y-2 flex-1 min-w-0">
              <p className="text-sm font-semibold leading-none">Upload video to Google Drive</p>
              {driveFolderUrl ? (
                <a
                  href={driveFolderUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary shadow-sm hover:bg-primary/10 hover:border-primary transition-colors"
                >
                  <HardDrive className="w-3.5 h-3.5 shrink-0" />
                  Upload video to our Drive folder →
                </a>
              ) : (
                <p className="text-xs text-muted-foreground">Upload the video to your Google Drive account.</p>
              )}
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-3 items-start rounded-lg border border-border bg-muted/20 p-3">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">2</div>
            <div className="space-y-2 flex-1 min-w-0">
              <p className="text-sm font-semibold leading-none">Copy and paste the share link</p>
              <p className="text-xs text-muted-foreground">Set sharing to "Anyone with the link" with <strong>Viewer</strong> permission.</p>
              <Input
                value={url}
                onChange={e => onUrlChange(convertDriveUrl(e.target.value))}
                placeholder="https://drive.google.com/file/d/.../view"
                required
              />
              {url && <p className="text-xs text-muted-foreground break-all">Embed: {url}</p>}
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-3 items-start rounded-lg border border-dashed border-border bg-muted/10 p-3 opacity-70">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground text-xs font-bold">3</div>
            <div className="space-y-1 flex-1 min-w-0">
              <p className="text-sm font-semibold leading-none text-muted-foreground">Update description</p>
              <p className="text-xs text-muted-foreground">Add a description for this video in the field below ↓</p>
            </div>
          </div>
        </div>
      )}

      {sourceType === "upload" && (
        <div className="space-y-2">
          <Label>Video File</Label>
          <p className="text-xs text-muted-foreground">
            Max size: {maxSizeMb} MB. Accepted: mp4, mov, webm, avi.
          </p>
          {url && url.startsWith("/objects/") ? (
            <div className="flex items-center gap-2 p-2 bg-muted/30 rounded text-xs">
              <Video className="w-4 h-4 text-primary shrink-0" />
              <span className="truncate text-muted-foreground">{url}</span>
              <Button type="button" size="sm" variant="ghost" className="h-6 text-xs" onClick={() => { onUrlChange(""); if (fileInputRef.current) fileInputRef.current.value = ""; }}>
                Remove
              </Button>
            </div>
          ) : (
            <div
              className="border-2 border-dashed border-input rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              {isUploading ? (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Uploading...</p>
                  <Progress value={progress} className="h-2" />
                </div>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Click to select a video file</p>
                </>
              )}
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={handleFileChange}
            disabled={isUploading}
          />
          {isUploading && <input type="hidden" required value="" />}
          {!isUploading && sourceType === "upload" && <input type="hidden" required={!url} value={url} />}
        </div>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function ImageUploadPicker({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

  const { uploadFile, isUploading, progress } = useUpload({
    basePath: `${BASE}/api/storage`,
    onSuccess: (response) => {
      onChange(response.objectPath);
      toast({ title: "Image uploaded" });
    },
    onError: (err) => {
      toast({ title: err.message || "Upload failed", variant: "destructive" });
    },
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadFile(file);
  };

  return (
    <div className="space-y-2">
      <Label>
        Image <span className="text-muted-foreground font-normal text-xs">(optional)</span>
      </Label>
      {value ? (
        <div className="relative group w-full rounded-lg overflow-hidden border border-input bg-muted/20 aspect-video">
          <img src={resolveStorageUrl(value)} alt="Preview" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => fileInputRef.current?.click()}>
              Change
            </Button>
            <Button type="button" size="sm" variant="destructive" onClick={() => onChange("")}>
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <div
          className="border-2 border-dashed border-input rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          {isUploading ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Uploading...</p>
              <Progress value={progress} className="h-2" />
            </div>
          ) : (
            <>
              <ImageIcon className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Click to upload an image</p>
              <p className="text-xs text-muted-foreground/70 mt-1">PNG, JPG, WebP, GIF</p>
            </>
          )}
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
        disabled={isUploading}
      />
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

// ── Content Permissions Context ───────────────────────────────────────────────

type GrantedSets = { tracks: Set<number>; modules: Set<number>; videos: Set<number>; documents: Set<number> };
type ContentPermsCtx = {
  isAdmin: boolean;
  myClerkId: string | null | undefined;
  grantedIds: GrantedSets;
  canEdit: (type: "track" | "module" | "video" | "document", item: { id: number; createdByClerkId?: string | null }) => boolean;
};
const ContentPermissionsCtx = createContext<ContentPermsCtx>({
  isAdmin: true,
  myClerkId: null,
  grantedIds: { tracks: new Set(), modules: new Set(), videos: new Set(), documents: new Set() },
  canEdit: () => true,
});
const useContentPerms = () => useContext(ContentPermissionsCtx);

// ── Manage Editors Dialog (admin-only) ────────────────────────────────────────

function ManageEditorsDialog({ contentType, contentId, contentName }: { contentType: "track" | "module" | "video"; contentId: number; contentName: string }) {
  const { toast } = useToast();
  const { data: allUsers } = useAdminListUsers();
  const [open, setOpen] = useState(false);
  const [grants, setGrants] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedClerkId, setSelectedClerkId] = useState("");
  const [granting, setGranting] = useState(false);

  const managers = ((allUsers ?? []) as any[]).filter((u: any) => u.role === "manager");

  const loadGrants = async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`/api/admin/content-grants?contentType=${contentType}&contentId=${contentId}`);
      setGrants(await r?.json() ?? []);
    } catch { toast({ title: "Failed to load editors", variant: "destructive" }); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (open) loadGrants(); }, [open]);

  const handleGrant = async () => {
    if (!selectedClerkId) return;
    setGranting(true);
    try {
      await apiFetch("/api/admin/content-grants", {
        method: "POST",
        body: JSON.stringify({ contentType, contentId, granteeClerkId: selectedClerkId }),
      });
      setSelectedClerkId("");
      await loadGrants();
      toast({ title: "Editor access granted" });
    } catch { toast({ title: "Failed to grant access", variant: "destructive" }); }
    finally { setGranting(false); }
  };

  const handleRevoke = async (grantId: number) => {
    try {
      await apiFetch(`/api/admin/content-grants/${grantId}`, { method: "DELETE" });
      await loadGrants();
    } catch { toast({ title: "Failed to revoke access", variant: "destructive" }); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-8 px-2" title="Manage who can edit this content">
          <Shield className="w-3.5 h-3.5 mr-1" /> Editors
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Manage Editors — {contentName}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Grant managers the ability to edit and delete this content.</p>
        {loading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Loading...</p>
        ) : (
          <div className="space-y-4 mt-2">
            {grants.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2 border border-dashed rounded text-center">No editor grants yet — only the creator can edit this.</p>
            ) : (
              <div className="space-y-2">
                {grants.map((g: any) => (
                  <div key={g.id} className="flex items-center justify-between bg-muted/30 rounded px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">{g.grantee?.firstName} {g.grantee?.lastName}</p>
                      <p className="text-xs text-muted-foreground">{g.grantee?.email}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleRevoke(g.id)}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {managers.length > 0 && (
              <div className="border-t pt-4 space-y-3">
                <p className="text-sm font-medium">Grant a manager edit access</p>
                <div className="flex gap-2">
                  <Select value={selectedClerkId} onValueChange={setSelectedClerkId}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select a manager..." />
                    </SelectTrigger>
                    <SelectContent>
                      {managers.map((m: any) => (
                        <SelectItem key={m.id} value={m.id}>{m.firstName} {m.lastName} — {m.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={handleGrant} disabled={!selectedClerkId || granting} size="sm">
                    {granting ? "..." : "Grant"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Edit Video Dialog ─────────────────────────────────────────────────────────

function EditVideoDialog({ video, moduleId, onSaved }: { video: VideoType; moduleId: number; onSaved: () => void }) {
  const { toast } = useToast();
  const { mutate: updateVideo } = useUpdateVideo();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(video.title);
  const [url, setUrl] = useState(video.url);
  const [sourceType, setSourceType] = useState<VideoSourceType>((video.videoType as VideoSourceType) ?? "embed");
  const [desc, setDesc] = useState(video.description ?? "");
  const [duration, setDuration] = useState(video.durationSeconds ? String(video.durationSeconds) : "");
  const [order, setOrder] = useState(String(video.order));

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (sourceType === "upload" && !url) {
      toast({ title: "Please upload a video file first", variant: "destructive" });
      return;
    }
    updateVideo({
      videoId: video.id,
      data: {
        title,
        url,
        videoType: sourceType,
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

  const resetState = () => {
    setTitle(video.title);
    setUrl(video.url);
    setSourceType((video.videoType as VideoSourceType) ?? "embed");
    setDesc(video.description ?? "");
    setDuration(video.durationSeconds ? String(video.durationSeconds) : "");
    setOrder(String(video.order));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) resetState(); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" title="Edit video">
          <Pencil className="w-3 h-3" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Edit Video</DialogTitle></DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          <FormField label="Title"><Input value={title} onChange={e => setTitle(e.target.value)} required /></FormField>
          <VideoSourcePicker
            sourceType={sourceType}
            onSourceChange={(t) => { setSourceType(t); setUrl(""); }}
            url={url}
            onUrlChange={setUrl}
            onUploadComplete={setUrl}
          />
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
  const { canEdit, isAdmin } = useContentPerms();
  const { data: modules } = useListModules({ trackId }, { query: { queryKey: getListModulesQueryKey({ trackId }) } });
  const { mutate: createModule } = useCreateModule();
  const { mutate: updateModule } = useUpdateModule();
  const { mutate: deleteModule } = useDeleteModule();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [order, setOrder] = useState("1");
  const [isPublic, setIsPublic] = useState(true);
  const [moduleImageUrl, setModuleImageUrl] = useState("");
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const [editingModule, setEditingModule] = useState<any | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editOrder, setEditOrder] = useState("1");
  const [editIsPublic, setEditIsPublic] = useState(true);
  const [editImageUrl, setEditImageUrl] = useState("");

  const openEditDialog = (mod: any) => {
    setEditingModule(mod);
    setEditTitle(mod.title);
    setEditDesc(mod.description ?? "");
    setEditOrder(String(mod.order));
    setEditIsPublic(mod.isPublic);
    setEditImageUrl(mod.imageUrl ?? "");
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createModule({ data: { trackId, title, description: desc || null, imageUrl: moduleImageUrl || null, order: parseInt(order), isPublic } }, {
      onSuccess: () => {
        toast({ title: "Module created" });
        setOpen(false); setTitle(""); setDesc(""); setOrder("1"); setIsPublic(true); setModuleImageUrl("");
        queryClient.invalidateQueries({ queryKey: getListModulesQueryKey({ trackId }) });
      },
    });
  };

  const handleEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingModule) return;
    updateModule({ moduleId: editingModule.id, data: { title: editTitle, description: editDesc || null, imageUrl: editImageUrl || null, order: parseInt(editOrder), isPublic: editIsPublic } }, {
      onSuccess: () => {
        toast({ title: "Module updated" });
        setEditingModule(null);
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
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Add Module</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <FormField label="Title"><Input value={title} onChange={e => setTitle(e.target.value)} required /></FormField>
              <FormField label="Description"><Textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} /></FormField>
              <ImageUploadPicker value={moduleImageUrl} onChange={setModuleImageUrl} />
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

      {/* Edit Module Dialog */}
      <Dialog open={!!editingModule} onOpenChange={v => { if (!v) setEditingModule(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Module</DialogTitle></DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            <FormField label="Title"><Input value={editTitle} onChange={e => setEditTitle(e.target.value)} required /></FormField>
            <FormField label="Description"><Textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={2} /></FormField>
            <ImageUploadPicker value={editImageUrl} onChange={setEditImageUrl} />
            <FormField label="Order"><Input type="number" value={editOrder} onChange={e => setEditOrder(e.target.value)} min="1" /></FormField>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setEditIsPublic(v => !v)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${editIsPublic ? "bg-primary" : "bg-muted-foreground/30"}`}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition-transform ${editIsPublic ? "translate-x-5" : "translate-x-0"}`} />
              </button>
              <span className="text-sm font-medium flex items-center gap-1.5">
                {editIsPublic ? <Globe className="w-4 h-4 text-primary" /> : <Lock className="w-4 h-4 text-muted-foreground" />}
                {editIsPublic ? "Public — visible to all students" : "Private — only visible when assigned"}
              </span>
            </div>
            <Button type="submit" className="w-full">Save Changes</Button>
          </form>
        </DialogContent>
      </Dialog>

      {(modules as any[])?.sort((a, b) => a.order - b.order).map((mod: any) => (
        <div key={mod.id} className="border rounded-lg bg-background">
          <Accordion type="single" collapsible>
            <AccordionItem value={String(mod.id)} className="border-0">
              <AccordionTrigger className="px-4 py-3 hover:no-underline">
                <div className="flex items-center gap-2 text-left flex-1 min-w-0">
                  {mod.imageUrl ? (
                    <img src={resolveStorageUrl(mod.imageUrl)} alt={mod.title} className="w-8 h-8 rounded object-cover shrink-0 border border-border" />
                  ) : (
                    <Badge variant="outline" className="text-xs shrink-0">{mod.order}</Badge>
                  )}
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
                <div className="flex gap-2 pt-1 flex-wrap">
                  {isAdmin && (
                    <ManageEditorsDialog contentType="module" contentId={mod.id} contentName={mod.title} />
                  )}
                  {canEdit("module", mod) && (
                    <>
                      <Button
                        variant="outline" size="sm"
                        className="flex-1 justify-start"
                        onClick={() => openEditDialog(mod)}
                      >
                        <Pencil className="w-3.5 h-3.5 mr-2" /> Edit Module
                      </Button>
                      <Button
                        variant="ghost" size="sm"
                        className="text-destructive hover:text-destructive flex-1 justify-start"
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
                    </>
                  )}
                </div>
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
  const { canEdit } = useContentPerms();
  const { data: videos } = useListVideos({ moduleId }, { query: { queryKey: getListVideosQueryKey({ moduleId }) } });
  const { mutate: createVideo } = useCreateVideo();
  const { mutate: deleteVideo } = useDeleteVideo();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [sourceType, setSourceType] = useState<VideoSourceType>("embed");
  const [desc, setDesc] = useState("");
  const [duration, setDuration] = useState("");
  const [order, setOrder] = useState("1");

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (sourceType === "upload" && !url) {
      toast({ title: "Please upload a video file first", variant: "destructive" });
      return;
    }
    createVideo({
      data: { moduleId, title, url, videoType: sourceType, description: desc, durationSeconds: duration ? parseInt(duration) : undefined, order: parseInt(order) }
    }, {
      onSuccess: () => {
        toast({ title: "Video added" });
        setOpen(false); setTitle(""); setUrl(""); setSourceType("embed"); setDesc(""); setDuration(""); setOrder("1");
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
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setTitle(""); setUrl(""); setSourceType("embed"); setDesc(""); setDuration(""); setOrder("1"); } }}>
          <DialogTrigger asChild>
            <Button size="sm" variant="ghost" className="h-7 text-xs"><Plus className="w-3 h-3 mr-1" /> Add Video</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Add Video</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <FormField label="Title"><Input value={title} onChange={e => setTitle(e.target.value)} required /></FormField>
              <VideoSourcePicker
                sourceType={sourceType}
                onSourceChange={(t) => { setSourceType(t); setUrl(""); }}
                url={url}
                onUrlChange={setUrl}
                onUploadComplete={setUrl}
              />
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
          {canEdit("video", v as any) && (
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
          )}
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

// ── Document Repository Tab ───────────────────────────────────────────────────

const repoFetch = async (path: string, opts?: RequestInit): Promise<any> => {
  const r = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...opts,
  });
  if (!r.ok) throw new Error(await r.text());
  if (r.status === 204) return null;
  return r.json();
};

type RepoDoc = {
  id: number;
  title: string;
  description: string | null;
  driveUrl: string | null;
  resourceType: "file" | "folder";
  parentId: number | null;
  sortOrder: number;
  createdAt: string;
  accessCount: number;
};

type AccessGrant = {
  id: number;
  documentId: number;
  principalType: "group" | "user";
  principalId: string;
  displayName: string;
  email: string | null;
  grantedAt: string;
};

type RepoGroup = { id: number; name: string };
type RepoUser = { id: string; firstName: string; lastName: string; email: string; role: string };

function DocumentsTab() {
  const { toast } = useToast();
  const [docs, setDocs] = useState<RepoDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFolder, setSelectedFolder] = useState<number | "all" | "unfiled">("all");

  const [createFileOpen, setCreateFileOpen] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newParentId, setNewParentId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [importFolderUrl, setImportFolderUrl] = useState("");
  const [importParentId, setImportParentId] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);

  const [editDoc, setEditDoc] = useState<RepoDoc | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editParentId, setEditParentId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const [accessDoc, setAccessDoc] = useState<RepoDoc | null>(null);
  const [grants, setGrants] = useState<AccessGrant[]>([]);
  const [grantsLoading, setGrantsLoading] = useState(false);
  const [addType, setAddType] = useState<"group" | "user">("group");
  const [addId, setAddId] = useState("");
  const [repoGroups, setRepoGroups] = useState<RepoGroup[]>([]);
  const [repoUsers, setRepoUsers] = useState<RepoUser[]>([]);
  const [addingGrant, setAddingGrant] = useState(false);

  const loadDocs = async () => {
    setLoading(true);
    try {
      const tree = await repoFetch("/api/admin/documents");
      const allDocs: RepoDoc[] = [
        ...tree.folders.map(({ documents: _docs, ...f }: any) => f as RepoDoc),
        ...tree.folders.flatMap((f: any) => (f.documents ?? []) as RepoDoc[]),
        ...(tree.unfiled as RepoDoc[]),
      ];
      setDocs(allDocs);
    } catch {
      toast({ title: "Failed to load repository", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadDocs(); }, []);

  useEffect(() => {
    repoFetch("/api/groups").then(setRepoGroups).catch(() => {});
    repoFetch("/api/admin/users").then(setRepoUsers).catch(() => {});
  }, []);

  const folders = docs.filter(d => d.resourceType === "folder");
  const fileDocs = docs.filter(d => d.resourceType === "file");
  // "all" shows folders first then files; other views show only file docs
  const visibleItems = selectedFolder === "all"
    ? [...folders, ...fileDocs]
    : selectedFolder === "unfiled"
    ? fileDocs.filter(d => d.parentId === null)
    : fileDocs.filter(d => d.parentId === selectedFolder);
  const unfiledCount = fileDocs.filter(d => d.parentId === null).length;
  const folderCount = (id: number) => fileDocs.filter(d => d.parentId === id).length;

  const openAccess = async (doc: RepoDoc) => {
    setAccessDoc(doc);
    setGrantsLoading(true);
    try {
      setGrants(await repoFetch(`/api/admin/documents/${doc.id}/access`));
    } catch {
      toast({ title: "Failed to load access", variant: "destructive" });
    } finally {
      setGrantsLoading(false);
    }
  };

  const refreshGrants = async (docId: number) => {
    const data = await repoFetch(`/api/admin/documents/${docId}/access`);
    setGrants(data);
    setDocs(prev => prev.map(d => d.id === docId ? { ...d, accessCount: data.length } : d));
  };

  const handleAddGrant = async () => {
    if (!accessDoc || !addId) return;
    setAddingGrant(true);
    try {
      await repoFetch(`/api/admin/documents/${accessDoc.id}/access`, {
        method: "POST",
        body: JSON.stringify({ principalType: addType, principalId: addId }),
      });
      setAddId("");
      await refreshGrants(accessDoc.id);
    } catch (err: any) {
      toast({ title: (err.message ?? "").includes("already") ? "Already granted" : "Failed to add access", variant: "destructive" });
    } finally {
      setAddingGrant(false);
    }
  };

  const handleRemoveGrant = async (grantId: number) => {
    if (!accessDoc) return;
    try {
      await repoFetch(`/api/admin/documents/${accessDoc.id}/access/${grantId}`, { method: "DELETE" });
      await refreshGrants(accessDoc.id);
    } catch {
      toast({ title: "Failed to remove access", variant: "destructive" });
    }
  };

  const handleCreateFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newUrl.trim()) return;
    setCreating(true);
    try {
      await repoFetch("/api/admin/documents", {
        method: "POST",
        body: JSON.stringify({ title: newTitle.trim(), description: newDesc.trim() || null, driveUrl: newUrl.trim(), resourceType: "file", parentId: newParentId }),
      });
      toast({ title: "Document added" });
      setCreateFileOpen(false);
      setNewTitle(""); setNewDesc(""); setNewUrl(""); setNewParentId(null);
      loadDocs();
    } catch {
      toast({ title: "Failed to create document", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      await repoFetch("/api/admin/documents", {
        method: "POST",
        body: JSON.stringify({ title: newTitle.trim(), description: newDesc.trim() || null, resourceType: "folder" }),
      });
      toast({ title: "Folder created" });
      setCreateFolderOpen(false);
      setNewTitle(""); setNewDesc("");
      loadDocs();
    } catch {
      toast({ title: "Failed to create folder", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (doc: RepoDoc) => {
    setEditDoc(doc);
    setEditTitle(doc.title);
    setEditDesc(doc.description ?? "");
    setEditUrl(doc.driveUrl ?? "");
    setEditParentId(doc.parentId);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editDoc) return;
    setSaving(true);
    try {
      await repoFetch(`/api/admin/documents/${editDoc.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDesc.trim() || null,
          ...(editDoc.resourceType === "file" ? { driveUrl: editUrl.trim() || null, parentId: editParentId } : {}),
        }),
      });
      toast({ title: "Saved" });
      setEditDoc(null);
      loadDocs();
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (doc: RepoDoc) => {
    const msg = doc.resourceType === "folder"
      ? `Delete folder "${doc.title}"? This will also permanently delete all documents inside it.`
      : `Delete "${doc.title}"?`;
    if (!confirm(msg)) return;
    try {
      await repoFetch(`/api/admin/documents/${doc.id}`, { method: "DELETE" });
      toast({ title: doc.resourceType === "folder" ? "Folder deleted" : "Document deleted" });
      if (selectedFolder === doc.id) setSelectedFolder("all");
      loadDocs();
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  const handleImportFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFolderUrl.trim()) return;
    setImporting(true);
    try {
      const result = await repoFetch("/api/admin/documents/import-folder", {
        method: "POST",
        body: JSON.stringify({ folderUrl: importFolderUrl.trim(), parentId: importParentId }),
      });
      if (result.imported === 0) {
        toast({ title: result.message ?? "No files found in that folder" });
      } else {
        toast({ title: `Imported ${result.imported} document${result.imported !== 1 ? "s" : ""}` });
      }
      setImportOpen(false);
      setImportFolderUrl("");
      setImportParentId(null);
      loadDocs();
    } catch (err: any) {
      const msg: string = err?.message ?? "";
      if (msg.includes("GOOGLE_API_KEY")) {
        toast({ title: "Google API key not configured", description: "Add GOOGLE_API_KEY to Replit Secrets to enable Drive folder import.", variant: "destructive" });
      } else {
        toast({ title: msg || "Failed to import from Drive", variant: "destructive" });
      }
    } finally {
      setImporting(false);
    }
  };

  const isDriveUrl = newUrl.includes("drive.google.com");

  const navBtn = (active: boolean, label: string, count: number, onClick: () => void, onDelete?: () => void) => (
    <div className={`group flex items-center gap-1 rounded-md ${active ? "bg-sidebar-accent" : ""}`}>
      <button
        onClick={onClick}
        className={`flex-1 text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between gap-2 ${active ? "text-sidebar-accent-foreground font-medium" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`}
      >
        <span className="truncate">{label}</span>
        {count > 0 && <Badge variant="secondary" className="text-xs h-4 px-1 shrink-0">{count}</Badge>}
      </button>
      {onDelete && (
        <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 mr-1 shrink-0 text-muted-foreground hover:text-destructive" onClick={onDelete} title="Delete folder">
          <Trash2 className="w-3 h-3" />
        </Button>
      )}
    </div>
  );

  if (loading) return <div className="py-16 text-center text-muted-foreground">Loading repository...</div>;

  return (
    <div className="flex gap-6 min-h-[500px]">
      {/* Sidebar */}
      <div className="w-56 shrink-0">
        <div className="flex items-center justify-between mb-3 px-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Library</p>
          <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => { setNewTitle(""); setNewDesc(""); setCreateFolderOpen(true); }}>
            <Plus className="w-3 h-3 mr-1" /> Folder
          </Button>
        </div>
        <div className="space-y-0.5">
          {navBtn(selectedFolder === "all", "All Documents", fileDocs.length, () => setSelectedFolder("all"))}
          {navBtn(selectedFolder === "unfiled", "Unfiled", unfiledCount, () => setSelectedFolder("unfiled"))}
          {folders.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground px-1 pt-3 pb-1">Folders</p>
              {folders.map(f => navBtn(
                selectedFolder === f.id,
                f.title,
                folderCount(f.id),
                () => setSelectedFolder(f.id),
                () => handleDelete(f),
              ))}
            </>
          )}
        </div>
      </div>

      {/* Main panel */}
      <div className="flex-1 min-w-0 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h3 className="font-semibold text-base">
            {selectedFolder === "all" ? "All Documents" : selectedFolder === "unfiled" ? "Unfiled" : (folders.find(f => f.id === selectedFolder)?.title ?? "Folder")}
          </h3>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => { setImportFolderUrl(""); setImportParentId(typeof selectedFolder === "number" ? selectedFolder : null); setImportOpen(true); }}>
              <HardDrive className="w-3.5 h-3.5 mr-1.5" /> Import from Drive
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setNewTitle(""); setNewDesc(""); setNewUrl(""); setNewParentId(typeof selectedFolder === "number" ? selectedFolder : null); setCreateFileOpen(true); }}>
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Document
            </Button>
          </div>
        </div>

        {visibleItems.length === 0 ? (
          <div className="border border-dashed rounded-lg p-12 text-center text-muted-foreground">
            <FileText className="w-8 h-8 mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium mb-1">No documents here yet</p>
            <p className="text-xs">Click "Add Document" to link a Google Drive file.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleItems.map(doc => {
              const isFolder = doc.resourceType === "folder";
              const folderName = !isFolder && doc.parentId ? folders.find(f => f.id === doc.parentId)?.title : null;
              return (
                <div key={doc.id} className="flex items-center gap-3 bg-muted/30 rounded-lg px-4 py-3">
                  <div className={`rounded-md p-1.5 shrink-0 ${isFolder ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"}`}>
                    {isFolder ? <FolderOpen className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{doc.title}</p>
                      {isFolder && <Badge variant="outline" className="text-xs h-4 px-1.5 shrink-0">Folder</Badge>}
                      {!isFolder && doc.driveUrl && !/\/file\/d\//.test(doc.driveUrl) && (
                        <span title="URL doesn't look like a direct Google Drive file link — students may not be able to preview it" className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 shrink-0">
                          <AlertTriangle className="w-3 h-3" /> Bad link
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {folderName && <span className="text-xs text-muted-foreground"><FolderOpen className="w-3 h-3 inline mr-0.5" />{folderName}</span>}
                      {doc.description && <span className="text-xs text-muted-foreground truncate max-w-xs">{doc.description}</span>}
                      {isFolder && <span className="text-xs text-muted-foreground">{folderCount(doc.id)} doc{folderCount(doc.id) !== 1 ? "s" : ""}</span>}
                    </div>
                  </div>
                  {doc.accessCount === 0 ? (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0 whitespace-nowrap">
                      <Lock className="w-3 h-3" /> Private
                    </div>
                  ) : (
                    <Badge variant="secondary" className="text-xs shrink-0 gap-1">
                      <Shield className="w-3 h-3" />{doc.accessCount} {doc.accessCount === 1 ? "grant" : "grants"}
                    </Badge>
                  )}
                  {!isFolder && doc.driveUrl && (
                    <a href={doc.driveUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline shrink-0">Open</a>
                  )}
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(doc)} title="Edit">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openAccess(doc)} title="Manage access">
                      <Shield className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(doc)} title="Delete">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Import from Drive Dialog */}
      <Dialog open={importOpen} onOpenChange={v => { if (!v) { setImportOpen(false); setImportFolderUrl(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-blue-500" /> Import from Google Drive Folder
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleImportFolder} className="space-y-4">
            <div className="rounded-md bg-muted/40 border px-4 py-3 text-sm text-muted-foreground space-y-1">
              <p>Paste the URL of a <strong>publicly shared</strong> Google Drive folder. All files inside (excluding sub-folders) will be created as private documents.</p>
            </div>
            <FormField label="Google Drive Folder URL">
              <Input
                value={importFolderUrl}
                onChange={e => setImportFolderUrl(e.target.value)}
                required
                placeholder="https://drive.google.com/drive/folders/..."
              />
            </FormField>
            {folders.length > 0 && (
              <div className="space-y-1.5">
                <Label>Place in folder <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
                <Select value={importParentId !== null ? String(importParentId) : "__none__"} onValueChange={v => setImportParentId(v === "__none__" ? null : parseInt(v))}>
                  <SelectTrigger><SelectValue placeholder="None (Unfiled)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None (Unfiled)</SelectItem>
                    {folders.map(f => <SelectItem key={f.id} value={String(f.id)}>{f.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button type="submit" className="w-full" disabled={importing}>
              {importing ? "Importing..." : "Import Files"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Document Dialog */}
      <Dialog open={createFileOpen} onOpenChange={v => { if (!v) setCreateFileOpen(false); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Document</DialogTitle></DialogHeader>
          <form onSubmit={handleCreateFile} className="space-y-4">
            <FormField label="Title"><Input value={newTitle} onChange={e => setNewTitle(e.target.value)} required placeholder="e.g. Onboarding Guide" /></FormField>
            <FormField label="Description (optional)"><Textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} rows={2} /></FormField>
            <div className="space-y-1.5">
              <Label>Google Drive URL</Label>
              <Input value={newUrl} onChange={e => setNewUrl(e.target.value)} required placeholder="https://drive.google.com/..." />
              {isDriveUrl && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-blue-500" /> Google Drive link detected — students will be able to preview or open in Drive
                </p>
              )}
            </div>
            {folders.length > 0 && (
              <div className="space-y-1.5">
                <Label>Folder</Label>
                <Select value={newParentId !== null ? String(newParentId) : "__none__"} onValueChange={v => setNewParentId(v === "__none__" ? null : parseInt(v))}>
                  <SelectTrigger><SelectValue placeholder="None (Unfiled)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None (Unfiled)</SelectItem>
                    {folders.map(f => <SelectItem key={f.id} value={String(f.id)}>{f.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button type="submit" className="w-full" disabled={creating}>{creating ? "Adding..." : "Add Document"}</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* New Folder Dialog */}
      <Dialog open={createFolderOpen} onOpenChange={v => { if (!v) setCreateFolderOpen(false); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Folder</DialogTitle></DialogHeader>
          <form onSubmit={handleCreateFolder} className="space-y-4">
            <FormField label="Folder Name"><Input value={newTitle} onChange={e => setNewTitle(e.target.value)} required placeholder="e.g. Leadership Resources" /></FormField>
            <FormField label="Description (optional)"><Textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} rows={2} /></FormField>
            <Button type="submit" className="w-full" disabled={creating}>{creating ? "Creating..." : "Create Folder"}</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editDoc} onOpenChange={v => { if (!v) setEditDoc(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit {editDoc?.resourceType === "folder" ? "Folder" : "Document"}</DialogTitle></DialogHeader>
          {editDoc && (
            <form onSubmit={handleEdit} className="space-y-4">
              <FormField label="Title"><Input value={editTitle} onChange={e => setEditTitle(e.target.value)} required /></FormField>
              <FormField label="Description (optional)"><Textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={2} /></FormField>
              {editDoc.resourceType === "file" && (
                <>
                  <FormField label="Google Drive URL"><Input value={editUrl} onChange={e => setEditUrl(e.target.value)} /></FormField>
                  {folders.filter(f => f.id !== editDoc.id).length > 0 && (
                    <div className="space-y-1.5">
                      <Label>Folder</Label>
                      <Select value={editParentId !== null ? String(editParentId) : "__none__"} onValueChange={v => setEditParentId(v === "__none__" ? null : parseInt(v))}>
                        <SelectTrigger><SelectValue placeholder="None (Unfiled)" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">None (Unfiled)</SelectItem>
                          {folders.map(f => <SelectItem key={f.id} value={String(f.id)}>{f.title}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </>
              )}
              <Button type="submit" className="w-full" disabled={saving}>{saving ? "Saving..." : "Save Changes"}</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Access Management Dialog */}
      <Dialog open={!!accessDoc} onOpenChange={v => { if (!v) { setAccessDoc(null); setGrants([]); setAddId(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-4 h-4" /> Access — {accessDoc?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            {grantsLoading ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Loading...</p>
            ) : grants.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground rounded-md border border-dashed px-4 py-3">
                <Lock className="w-4 h-4 shrink-0" /> Private — no one has been granted access yet
              </div>
            ) : (
              <div className="space-y-2">
                {grants.map(g => (
                  <div key={g.id} className="flex items-center gap-3 bg-muted/30 rounded-md px-3 py-2.5">
                    <Badge variant={g.principalType === "group" ? "secondary" : "outline"} className="text-xs shrink-0 capitalize gap-1">
                      {g.principalType === "group" ? <Users className="w-3 h-3" /> : null}
                      {g.principalType}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{g.displayName}</p>
                      {g.email && <p className="text-xs text-muted-foreground truncate">{g.email}</p>}
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive shrink-0" onClick={() => handleRemoveGrant(g.id)}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t pt-4 space-y-3">
              <p className="text-sm font-medium">Grant access</p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => { setAddType("group"); setAddId(""); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border transition-colors ${addType === "group" ? "bg-primary text-primary-foreground border-primary" : "border-input text-muted-foreground hover:bg-muted"}`}>
                  <Users className="w-3.5 h-3.5" /> Group
                </button>
                <button type="button" onClick={() => { setAddType("user"); setAddId(""); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border transition-colors ${addType === "user" ? "bg-primary text-primary-foreground border-primary" : "border-input text-muted-foreground hover:bg-muted"}`}>
                  <Globe className="w-3.5 h-3.5" /> Individual
                </button>
              </div>
              <div className="flex gap-2">
                <Select value={addId} onValueChange={setAddId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder={addType === "group" ? "Select a group..." : "Select a user..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {addType === "group"
                      ? repoGroups.map(g => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)
                      : repoUsers.map(u => <SelectItem key={u.id} value={u.id}>{u.firstName} {u.lastName} — {u.email}</SelectItem>)
                    }
                  </SelectContent>
                </Select>
                <Button onClick={handleAddGrant} disabled={!addId || addingGrant} size="sm">
                  {addingGrant ? "..." : "Grant"}
                </Button>
              </div>
            </div>
          </div>
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
  const { mutate: updateTrack } = useUpdateTrack();
  const { mutate: deleteTrack } = useDeleteTrack();

  const { user } = useUser();
  const myClerkId = user?.id ?? null;
  const [currentRole, setCurrentRole] = useState<string>("manager");
  const [myGrantedIds, setMyGrantedIds] = useState<GrantedSets>({
    tracks: new Set(), modules: new Set(), videos: new Set(), documents: new Set(),
  });
  const isAdmin = currentRole === "admin";

  useEffect(() => {
    apiFetch("/api/admin/me").then(r => r?.json()).then((me: any) => {
      if (me?.role) setCurrentRole(me.role);
    }).catch(() => {});
    apiFetch("/api/admin/content-grants/mine").then(r => r?.json()).then((g: any) => {
      if (g) setMyGrantedIds({
        tracks: new Set(g.tracks ?? []),
        modules: new Set(g.modules ?? []),
        videos: new Set(g.videos ?? []),
        documents: new Set(g.documents ?? []),
      });
    }).catch(() => {});
  }, []);

  const canEdit = (type: "track" | "module" | "video" | "document", item: { id: number; createdByClerkId?: string | null }) => {
    if (isAdmin) return true;
    if (item.createdByClerkId && item.createdByClerkId === myClerkId) return true;
    const key = (type + "s") as keyof GrantedSets;
    return myGrantedIds[key].has(item.id);
  };

  const ctxValue: ContentPermsCtx = { isAdmin, myClerkId, grantedIds: myGrantedIds, canEdit };

  const [addTrackOpen, setAddTrackOpen] = useState(false);
  const [trackName, setTrackName] = useState("");
  const [trackDesc, setTrackDesc] = useState("");
  const [trackImageUrl, setTrackImageUrl] = useState("");

  const [editingTrack, setEditingTrack] = useState<any | null>(null);
  const [editTrackName, setEditTrackName] = useState("");
  const [editTrackDesc, setEditTrackDesc] = useState("");
  const [editTrackImageUrl, setEditTrackImageUrl] = useState("");

  const openEditTrack = (track: any) => {
    setEditingTrack(track);
    setEditTrackName(track.name);
    setEditTrackDesc(track.description ?? "");
    setEditTrackImageUrl(track.imageUrl ?? "");
  };

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading content...</div>;

  const handleCreateTrack = (e: React.FormEvent) => {
    e.preventDefault();
    createTrack({ data: { name: trackName, description: trackDesc || null, imageUrl: trackImageUrl || null } }, {
      onSuccess: () => {
        toast({ title: "Track created" });
        setAddTrackOpen(false); setTrackName(""); setTrackDesc(""); setTrackImageUrl("");
        queryClient.invalidateQueries({ queryKey: getListTracksQueryKey() });
      },
    });
  };

  const handleEditTrack = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTrack) return;
    updateTrack({ trackId: editingTrack.id, data: { name: editTrackName, description: editTrackDesc || null, imageUrl: editTrackImageUrl || null } }, {
      onSuccess: () => {
        toast({ title: "Track updated" });
        setEditingTrack(null);
        queryClient.invalidateQueries({ queryKey: getListTracksQueryKey() });
      },
    });
  };

  return (
    <ContentPermissionsCtx.Provider value={ctxValue}>
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-serif">Content Manager</h1>
          <p className="text-muted-foreground mt-2">Manage tracks, modules, videos, quiz questions, assignments, and documents.</p>
        </div>
        <div className="flex items-center gap-2" id="content-header-actions">
          <AssignmentManager />
          <Dialog open={addTrackOpen} onOpenChange={setAddTrackOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-2" /> New Track</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Create Training Track</DialogTitle></DialogHeader>
              <form onSubmit={handleCreateTrack} className="space-y-4">
                <FormField label="Track Name"><Input value={trackName} onChange={e => setTrackName(e.target.value)} required /></FormField>
                <FormField label="Description"><Textarea value={trackDesc} onChange={e => setTrackDesc(e.target.value)} rows={3} /></FormField>
                <ImageUploadPicker value={trackImageUrl} onChange={setTrackImageUrl} />
                <Button type="submit" className="w-full">Create Track</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Edit Track Dialog */}
      <Dialog open={!!editingTrack} onOpenChange={v => { if (!v) setEditingTrack(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Track</DialogTitle></DialogHeader>
          <form onSubmit={handleEditTrack} className="space-y-4">
            <FormField label="Track Name"><Input value={editTrackName} onChange={e => setEditTrackName(e.target.value)} required /></FormField>
            <FormField label="Description"><Textarea value={editTrackDesc} onChange={e => setEditTrackDesc(e.target.value)} rows={3} /></FormField>
            <ImageUploadPicker value={editTrackImageUrl} onChange={setEditTrackImageUrl} />
            <Button type="submit" className="w-full">Save Changes</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="tracks">
        <TabsList className="mb-6">
          <TabsTrigger value="tracks">
            <BookOpen className="w-4 h-4 mr-2" /> Training Tracks
          </TabsTrigger>
          <TabsTrigger value="documents">
            <FileText className="w-4 h-4 mr-2" /> Documents
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tracks">
          <div className="space-y-4">
            {tracks?.map(track => (
              <Card key={track.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 min-w-0">
                      {track.imageUrl && (
                        <img src={resolveStorageUrl(track.imageUrl)} alt={track.name} className="w-14 h-14 rounded-lg object-cover shrink-0 border border-border" />
                      )}
                      <div className="min-w-0">
                        <CardTitle className="text-xl">{track.name}</CardTitle>
                        {track.description && <p className="text-sm text-muted-foreground mt-1">{track.description}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {isAdmin && (
                        <ManageEditorsDialog contentType="track" contentId={track.id} contentName={track.name} />
                      )}
                      {canEdit("track", track as any) && (
                        <>
                          <Button
                            variant="ghost" size="sm"
                            onClick={() => openEditTrack(track)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost" size="sm"
                            className="text-destructive hover:text-destructive"
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
                        </>
                      )}
                    </div>
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
        </TabsContent>

        <TabsContent value="documents">
          <DocumentsTab />
        </TabsContent>
      </Tabs>
    </div>
    </ContentPermissionsCtx.Provider>
  );
}
