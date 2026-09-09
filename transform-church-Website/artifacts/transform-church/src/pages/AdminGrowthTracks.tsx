import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@workspace/object-storage-web";
import { StorageImage } from "@/lib/storageUrl";
import {
  Plus, Trash2, ChevronUp, ChevronDown, Users, ListOrdered,
  Pencil, TrendingUp, CheckCircle2, Clock, UserMinus,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────

type GrowthTrack = {
  id: number;
  name: string;
  description: string | null;
  imageUrl: string | null;
  createdBy: string;
  createdAt: string;
  stepCount: number;
  enrollmentCount: number;
};

type StepWithModule = {
  id: number;
  growthTrackId: number;
  moduleId: number;
  stepOrder: number;
  module: { id: number; title: string; trackName: string | null } | null;
};

type EnrollmentRow = {
  id: number;
  userId: string;
  userName: string;
  userEmail: string;
  status: "active" | "completed";
  currentStepOrder: number;
  totalSteps: number;
  startedAt: string;
  completedAt: string | null;
};

type UserOption = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  role: string;
};

type GroupOption = {
  id: number;
  name: string;
  description: string | null;
};

// ─── API helper ────────────────────────────────────────────────────────────

const BASE = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch<T = unknown>(path: string, opts?: RequestInit): Promise<T> {
  const token = sessionStorage.getItem("auth_bearer_token");
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return null as T;
  return res.json() as Promise<T>;
}

// ─── ImageUploadPicker ─────────────────────────────────────────────────────

function ImageUploadPicker({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { uploadFile, isUploading, progress } = useUpload({
    basePath: `${BASE}/api/storage`,
    getAuthToken: () => sessionStorage.getItem("auth_bearer_token"),
    onSuccess: (response) => {
      onChange(response.objectPath);
      toast({ title: "Image uploaded" });
    },
    onError: (err) => {
      toast({ title: err.message || "Upload failed", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-2">
      <Label>Image <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); }} />
      {value ? (
        <div className="relative group w-full rounded-lg overflow-hidden border border-input bg-muted/20 aspect-video">
          <StorageImage src={value} alt="Preview" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => fileInputRef.current?.click()}>Change</Button>
            <Button type="button" size="sm" variant="destructive" onClick={() => onChange("")}>Remove</Button>
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
            <p className="text-sm text-muted-foreground">Click to upload image</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── GrowthTrackFormDialog ─────────────────────────────────────────────────

function GrowthTrackFormDialog({
  open, onClose, track,
}: {
  open: boolean;
  onClose: () => void;
  track?: GrowthTrack;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState(track?.name ?? "");
  const [description, setDescription] = useState(track?.description ?? "");
  const [imageUrl, setImageUrl] = useState(track?.imageUrl ?? "");
  const isEdit = !!track;

  const mutation = useMutation({
    mutationFn: () =>
      isEdit
        ? apiFetch(`/api/growth-tracks/${track.id}`, {
            method: "PATCH",
            body: JSON.stringify({ name, description: description || null, imageUrl: imageUrl || null }),
          })
        : apiFetch("/api/growth-tracks", {
            method: "POST",
            body: JSON.stringify({ name, description: description || undefined, imageUrl: imageUrl || undefined }),
          }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["growth-tracks"] });
      toast({ title: isEdit ? "Growth track updated" : "Growth track created" });
      onClose();
    },
    onError: () => toast({ title: "Something went wrong", variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Growth Track" : "New Growth Track"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. New Believer Journey" required />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Briefly describe this growth track..." rows={3} />
          </div>
          <ImageUploadPicker value={imageUrl} onChange={setImageUrl} />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!name.trim() || mutation.isPending}>
              {mutation.isPending ? "Saving..." : isEdit ? "Save Changes" : "Create Track"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── StepsManagerDialog ────────────────────────────────────────────────────

function StepsManagerDialog({
  open, onClose, track,
}: {
  open: boolean;
  onClose: () => void;
  track: GrowthTrack;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedModuleId, setSelectedModuleId] = useState("");

  const { data: steps = [], isLoading } = useQuery<StepWithModule[]>({
    queryKey: ["growth-tracks", track.id, "steps"],
    queryFn: () => apiFetch(`/api/growth-tracks/${track.id}/steps`),
    enabled: open,
  });

  // Build a flat module list by using a broader query
  const { data: flatModules = [] } = useQuery({
    queryKey: ["modules-all"],
    queryFn: () => apiFetch<{ id: number; title: string; trackId: number }[]>("/api/modules"),
    enabled: open,
  });

  const { data: tracks = [] } = useQuery({
    queryKey: ["tracks"],
    queryFn: () => apiFetch<{ id: number; name: string }[]>("/api/tracks"),
    enabled: open,
  });

  const trackNameMap = new Map(tracks.map((t) => [t.id, t.name]));
  const usedModuleIds = new Set(steps.map((s) => s.moduleId));
  const availableModules = flatModules.filter((m) => !usedModuleIds.has(m.id));

  const addStep = useMutation({
    mutationFn: (moduleId: number) =>
      apiFetch(`/api/growth-tracks/${track.id}/steps`, {
        method: "POST",
        body: JSON.stringify({ moduleId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["growth-tracks", track.id, "steps"] });
      qc.invalidateQueries({ queryKey: ["growth-tracks"] });
      setSelectedModuleId("");
      toast({ title: "Step added" });
    },
    onError: () => toast({ title: "Failed to add step", variant: "destructive" }),
  });

  const removeStep = useMutation({
    mutationFn: (stepId: number) =>
      apiFetch(`/api/growth-tracks/${track.id}/steps/${stepId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["growth-tracks", track.id, "steps"] });
      qc.invalidateQueries({ queryKey: ["growth-tracks"] });
      toast({ title: "Step removed" });
    },
    onError: () => toast({ title: "Failed to remove step", variant: "destructive" }),
  });

  const reorder = useMutation({
    mutationFn: (updates: { id: number; stepOrder: number }[]) =>
      apiFetch(`/api/growth-tracks/${track.id}/steps/reorder`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["growth-tracks", track.id, "steps"] }),
    onError: () => toast({ title: "Failed to reorder", variant: "destructive" }),
  });

  const moveStep = (index: number, direction: "up" | "down") => {
    const sorted = [...steps].sort((a, b) => a.stepOrder - b.stepOrder);
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= sorted.length) return;
    const updates = sorted.map((s, i) => {
      if (i === index) return { id: s.id, stepOrder: sorted[swapIndex]!.stepOrder };
      if (i === swapIndex) return { id: s.id, stepOrder: sorted[index]!.stepOrder };
      return { id: s.id, stepOrder: s.stepOrder };
    });
    reorder.mutate(updates);
  };

  const handleAddStep = () => {
    const id = parseInt(selectedModuleId);
    if (!id) return;
    addStep.mutate(id);
  };

  const sortedSteps = [...steps].sort((a, b) => a.stepOrder - b.stepOrder);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Steps — {track.name}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Build the ordered sequence of modules users will complete.
        </p>

        {isLoading ? (
          <div className="text-sm text-muted-foreground py-4 text-center">Loading steps...</div>
        ) : sortedSteps.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-lg">
            No steps yet — add modules below.
          </div>
        ) : (
          <div className="space-y-2">
            {sortedSteps.map((step, idx) => (
              <div key={step.id} className="flex items-center gap-2 p-3 border rounded-lg bg-muted/20">
                <span className="text-xs font-bold text-muted-foreground w-6 text-center">{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{step.module?.title ?? `Module #${step.moduleId}`}</p>
                  {step.module?.trackName && (
                    <p className="text-xs text-muted-foreground">{step.module.trackName}</p>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => moveStep(idx, "up")} disabled={idx === 0 || reorder.isPending}>
                    <ChevronUp className="w-3 h-3" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => moveStep(idx, "down")} disabled={idx === sortedSteps.length - 1 || reorder.isPending}>
                    <ChevronDown className="w-3 h-3" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeStep.mutate(step.id)} disabled={removeStep.isPending}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="border-t pt-4 space-y-3">
          <p className="text-sm font-medium">Add a module</p>
          <div className="flex gap-2">
            <Select value={selectedModuleId} onValueChange={setSelectedModuleId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder={availableModules.length === 0 ? "All modules already added" : "Select a module..."} />
              </SelectTrigger>
              <SelectContent>
                {availableModules.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    <span>{m.title}</span>
                    {trackNameMap.get(m.trackId) && (
                      <span className="text-muted-foreground ml-1 text-xs">({trackNameMap.get(m.trackId)})</span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleAddStep} disabled={!selectedModuleId || addStep.isPending}>
              <Plus className="w-4 h-4 mr-1" />Add
            </Button>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={onClose}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── EnrollDialog ──────────────────────────────────────────────────────────

function EnrollDialog({
  open, onClose, track,
}: {
  open: boolean;
  onClose: () => void;
  track: GrowthTrack;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"users" | "groups">("users");
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<number>>(new Set());

  const { data: users = [] } = useQuery<UserOption[]>({
    queryKey: ["admin-users"],
    queryFn: () => apiFetch("/api/admin/users"),
    enabled: open,
  });

  const { data: groups = [] } = useQuery<GroupOption[]>({
    queryKey: ["groups"],
    queryFn: () => apiFetch("/api/groups"),
    enabled: open,
  });

  const students = users.filter((u) => u.role === "student");

  const enroll = useMutation({
    mutationFn: () =>
      apiFetch<{ enrolled: number; skipped: number }>(`/api/growth-tracks/${track.id}/enroll`, {
        method: "POST",
        body: JSON.stringify({
          userIds: [...selectedUserIds],
          groupIds: [...selectedGroupIds],
        }),
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["growth-tracks"] });
      qc.invalidateQueries({ queryKey: ["growth-tracks", track.id, "enrollments"] });
      const msg = data
        ? `${data.enrolled} enrolled${data.skipped > 0 ? `, ${data.skipped} already enrolled` : ""}`
        : "Enrolled";
      toast({ title: msg });
      setSelectedUserIds(new Set());
      setSelectedGroupIds(new Set());
      onClose();
    },
    onError: () => toast({ title: "Enrollment failed", variant: "destructive" }),
  });

  const toggleUser = (id: string) => {
    const s = new Set(selectedUserIds);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelectedUserIds(s);
  };

  const toggleGroup = (id: number) => {
    const s = new Set(selectedGroupIds);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelectedGroupIds(s);
  };

  const totalSelected = selectedUserIds.size + selectedGroupIds.size;
  const hasSteps = track.stepCount > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enroll in {track.name}</DialogTitle>
        </DialogHeader>
        {!hasSteps && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 text-sm">
            This growth track has no steps yet. Add modules first before enrolling users.
          </div>
        )}

        <div className="flex border-b">
          <button
            className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${tab === "users" ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}
            onClick={() => setTab("users")}
          >
            Users ({students.length})
          </button>
          <button
            className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${tab === "groups" ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}
            onClick={() => setTab("groups")}
          >
            Groups ({groups.length})
          </button>
        </div>

        {tab === "users" && (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {students.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No students found</p>
            )}
            {students.map((u) => {
              const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email;
              return (
                <label key={u.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedUserIds.has(u.id)}
                    onChange={() => toggleUser(u.id)}
                    className="rounded"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{name}</p>
                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  </div>
                </label>
              );
            })}
          </div>
        )}

        {tab === "groups" && (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {groups.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No groups found</p>
            )}
            {groups.map((g) => (
              <label key={g.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedGroupIds.has(g.id)}
                  onChange={() => toggleGroup(g.id)}
                  className="rounded"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{g.name}</p>
                  {g.description && <p className="text-xs text-muted-foreground truncate">{g.description}</p>}
                </div>
              </label>
            ))}
          </div>
        )}

        <div className="flex justify-between items-center pt-2 border-t">
          <span className="text-sm text-muted-foreground">
            {totalSelected > 0 ? `${totalSelected} selection${totalSelected !== 1 ? "s" : ""}` : "Nothing selected"}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => enroll.mutate()} disabled={totalSelected === 0 || !hasSteps || enroll.isPending}>
              {enroll.isPending ? "Enrolling..." : "Enroll"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── EnrollmentsDialog ─────────────────────────────────────────────────────

function EnrollmentsDialog({
  open, onClose, track,
}: {
  open: boolean;
  onClose: () => void;
  track: GrowthTrack;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: enrollments = [], isLoading } = useQuery<EnrollmentRow[]>({
    queryKey: ["growth-tracks", track.id, "enrollments"],
    queryFn: () => apiFetch(`/api/growth-tracks/${track.id}/enrollments`),
    enabled: open,
  });

  const unenroll = useMutation({
    mutationFn: (enrollmentId: number) =>
      apiFetch(`/api/growth-tracks/enrollments/${enrollmentId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["growth-tracks", track.id, "enrollments"] });
      qc.invalidateQueries({ queryKey: ["growth-tracks"] });
      toast({ title: "Person unenrolled" });
    },
    onError: () => toast({ title: "Failed to unenroll", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enrollments — {track.name}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {enrollments.length} {enrollments.length === 1 ? "person" : "people"} enrolled
        </p>

        {isLoading ? (
          <div className="text-sm text-muted-foreground py-4 text-center">Loading...</div>
        ) : enrollments.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-lg">
            No one enrolled yet
          </div>
        ) : (
          <div className="space-y-2">
            {enrollments.map((e) => (
              <div key={e.id} className="flex items-center gap-3 p-3 border rounded-lg">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{e.userName}</p>
                    {e.status === "completed" ? (
                      <Badge variant="default" className="text-xs bg-green-600 shrink-0">
                        <CheckCircle2 className="w-3 h-3 mr-1" />Completed
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs shrink-0">
                        <Clock className="w-3 h-3 mr-1" />
                        Step {e.currentStepOrder}/{e.totalSteps}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{e.userEmail}</p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() => unenroll.mutate(e.id)}
                  disabled={unenroll.isPending}
                  title="Unenroll"
                >
                  <UserMinus className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── GrowthTrackCard ────────────────────────────────────────────────────────

function GrowthTrackCard({
  track,
  onEdit,
  onManageSteps,
  onEnroll,
  onViewEnrollments,
  onDelete,
}: {
  track: GrowthTrack;
  onEdit: () => void;
  onManageSteps: () => void;
  onEnroll: () => void;
  onViewEnrollments: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className="flex flex-col">
      {track.imageUrl && (
        <div className="aspect-video w-full overflow-hidden rounded-t-lg">
          <StorageImage src={track.imageUrl} alt={track.name} className="w-full h-full object-cover" />
        </div>
      )}
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{track.name}</CardTitle>
        {track.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">{track.description}</p>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3 flex-1">
        <div className="flex gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <ListOrdered className="w-4 h-4" />
            {track.stepCount} {track.stepCount === 1 ? "step" : "steps"}
          </span>
          <span className="flex items-center gap-1">
            <Users className="w-4 h-4" />
            {track.enrollmentCount} enrolled
          </span>
        </div>
        <div className="flex flex-wrap gap-2 mt-auto pt-2 border-t">
          <Button size="sm" variant="outline" onClick={onManageSteps} className="gap-1">
            <ListOrdered className="w-3.5 h-3.5" />Steps
          </Button>
          <Button size="sm" variant="outline" onClick={onEnroll} className="gap-1">
            <Plus className="w-3.5 h-3.5" />Enroll
          </Button>
          {track.enrollmentCount > 0 && (
            <Button size="sm" variant="outline" onClick={onViewEnrollments} className="gap-1">
              <Users className="w-3.5 h-3.5" />View
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onEdit} className="gap-1 ml-auto">
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={onDelete} className="gap-1 text-destructive hover:text-destructive hover:bg-destructive/10">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function AdminGrowthTracks() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [editTrack, setEditTrack] = useState<GrowthTrack | null>(null);
  const [stepsTrack, setStepsTrack] = useState<GrowthTrack | null>(null);
  const [enrollTrack, setEnrollTrack] = useState<GrowthTrack | null>(null);
  const [enrollmentsTrack, setEnrollmentsTrack] = useState<GrowthTrack | null>(null);

  const { data: tracks = [], isLoading } = useQuery<GrowthTrack[]>({
    queryKey: ["growth-tracks"],
    queryFn: () => apiFetch("/api/growth-tracks"),
  });

  const deleteTrack = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/growth-tracks/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["growth-tracks"] });
      toast({ title: "Growth track deleted" });
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  const handleDelete = (track: GrowthTrack) => {
    if (!confirm(`Delete "${track.name}"? This will remove all enrollments.`)) return;
    deleteTrack.mutate(track.id);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-primary" />
            Growth Tracks
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Curated sequences of modules that auto-advance as users complete each step.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="w-4 h-4" />New Growth Track
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading growth tracks...</div>
      ) : tracks.length === 0 ? (
        <div className="border border-dashed rounded-xl p-12 text-center space-y-3">
          <TrendingUp className="w-10 h-10 text-muted-foreground mx-auto" />
          <h3 className="font-semibold text-lg">No growth tracks yet</h3>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">
            Create your first growth track — an ordered sequence of modules users move through automatically.
          </p>
          <Button onClick={() => setShowCreate(true)} className="gap-2">
            <Plus className="w-4 h-4" />Create First Track
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tracks.map((track) => (
            <GrowthTrackCard
              key={track.id}
              track={track}
              onEdit={() => setEditTrack(track)}
              onManageSteps={() => setStepsTrack(track)}
              onEnroll={() => setEnrollTrack(track)}
              onViewEnrollments={() => setEnrollmentsTrack(track)}
              onDelete={() => handleDelete(track)}
            />
          ))}
        </div>
      )}

      {/* Dialogs */}
      <GrowthTrackFormDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
      />

      {editTrack && (
        <GrowthTrackFormDialog
          open
          onClose={() => setEditTrack(null)}
          track={editTrack}
        />
      )}

      {stepsTrack && (
        <StepsManagerDialog
          open
          onClose={() => setStepsTrack(null)}
          track={stepsTrack}
        />
      )}

      {enrollTrack && (
        <EnrollDialog
          open
          onClose={() => setEnrollTrack(null)}
          track={enrollTrack}
        />
      )}

      {enrollmentsTrack && (
        <EnrollmentsDialog
          open
          onClose={() => setEnrollmentsTrack(null)}
          track={enrollmentsTrack}
        />
      )}
    </div>
  );
}
