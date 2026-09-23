import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Settings, Upload, HardDrive, FolderOpen, ChevronRight, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";
import { useSiteCopy, SITE_COPY_DEFAULTS, type SiteCopyKey } from "@/lib/siteCopy";

const BASE = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string, opts?: RequestInit) {
  const token = sessionStorage.getItem("auth_bearer_token");
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...opts?.headers },
    ...opts,
  });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return null;
  return res;
}

async function saveSetting(key: string, value: string) {
  await apiFetch("/api/admin/settings", {
    method: "PATCH",
    body: JSON.stringify({ key, value }),
  });
}

type WikiDriveStatus = {
  state: "idle" | "running" | "success" | "error";
  lastSyncedAt: string | null;
  lastAttemptedAt: string | null;
  lastError: string | null;
  summary: { added: number; updated: number; removed: number; unchanged: number } | null;
};

type WikiDriveConfig = {
  sourceFolderId: string | null;
  sourceFolderLink: string | null;
  connectionConfigured: boolean;
  status: WikiDriveStatus;
};

type DriveFolder = { id: string; name: string; webViewLink: string };

const editableCopyKeys: { key: SiteCopyKey; label: string; group: string }[] = [
  { key: "nav.dashboard", label: "Dashboard", group: "Learning" },
  { key: "nav.trainingTracks", label: "Training Tracks", group: "Learning" },
  { key: "nav.myQueue", label: "My Queue", group: "Learning" },
  { key: "nav.groups", label: "Groups", group: "Learning" },
  { key: "nav.myProfile", label: "My Profile", group: "Learning" },
  { key: "nav.documents", label: "Documents", group: "Navigation" },
  { key: "nav.requestHub", label: "Request Hub", group: "Navigation" },
  { key: "nav.usersProgress", label: "Users & Progress", group: "Admin navigation" },
  { key: "nav.moduleManager", label: "Module Manager", group: "Admin navigation" },
  { key: "nav.documentManager", label: "Document Manager", group: "Admin navigation" },
  { key: "nav.growthTracks", label: "Growth Tracks", group: "Admin navigation" },
  { key: "nav.adminDashboard", label: "Admin Dashboard", group: "Admin navigation" },
  { key: "nav.adminSettings", label: "Admin Settings", group: "Admin navigation" },
  { key: "nav.signOut", label: "Sign out", group: "Navigation" },
  { key: "page.moduleManagerTitle", label: "Module Manager page title", group: "Page titles" },
  { key: "page.documentManagerTitle", label: "Document Manager page title", group: "Page titles" },
  { key: "page.trainingTracksTitle", label: "Training Tracks page title", group: "Page titles" },
  { key: "page.documentsTitle", label: "Documents page title", group: "Page titles" },
  { key: "page.adminSettingsTitle", label: "Admin Settings page title", group: "Page titles" },
];

export default function AdminSettings() {
  const { toast } = useToast();
  const { copy, refresh } = useSiteCopy();
  const [maxSizeMb, setMaxSizeMb] = useState("500");
  const [uploadEnabled, setUploadEnabled] = useState(true);
  const [driveFolderUrl, setDriveFolderUrl] = useState("");
  const [savingDriveFolder, setSavingDriveFolder] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingToggle, setSavingToggle] = useState(false);
  const [copyValues, setCopyValues] = useState<Record<SiteCopyKey, string>>(
    () => Object.fromEntries(Object.keys(SITE_COPY_DEFAULTS).map((key) => [key, ""])) as Record<SiteCopyKey, string>,
  );
  const [savingCopy, setSavingCopy] = useState(false);
  const [wikiDrive, setWikiDrive] = useState<WikiDriveConfig | null>(null);
  const [wikiDriveFolder, setWikiDriveFolder] = useState("");
  const [loadingWikiDrive, setLoadingWikiDrive] = useState(true);
  const [savingWikiDrive, setSavingWikiDrive] = useState(false);
  const [runningWikiDrive, setRunningWikiDrive] = useState(false);
  const [folderBrowserOpen, setFolderBrowserOpen] = useState(false);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [folderPath, setFolderPath] = useState<{ id: string | null; name: string }[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);

  useEffect(() => {
    apiFetch("/api/admin/settings")
      .then(r => r?.json())
      .then((settings: { key: string; value: string }[]) => {
        const sizeSetting = settings?.find(s => s.key === "max_video_upload_size_mb");
        if (sizeSetting) setMaxSizeMb(sizeSetting.value);
        const enabledSetting = settings?.find(s => s.key === "video_upload_enabled");
        if (enabledSetting) setUploadEnabled(enabledSetting.value !== "false");
        const folderSetting = settings?.find(s => s.key === "drive_upload_folder_url");
        if (folderSetting) setDriveFolderUrl(folderSetting.value);
        setCopyValues((current) => {
          const next = { ...current };
          for (const item of editableCopyKeys) {
            const setting = settings?.find((s) => s.key === `copy.${item.key}`);
            if (setting) next[item.key] = setting.value;
          }
          return next;
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const loadWikiDrive = async () => {
    try {
      const response = await apiFetch("/api/admin/wiki-drive-sync");
      const config = await response?.json() as WikiDriveConfig;
      setWikiDrive(config);
      setWikiDriveFolder(config.sourceFolderLink ?? config.sourceFolderId ?? "");
      setRunningWikiDrive(config.status.state === "running");
    } catch {
      toast({ title: "Could not load Google Drive Wiki Sync settings", variant: "destructive" });
    } finally {
      setLoadingWikiDrive(false);
    }
  };

  useEffect(() => {
    void loadWikiDrive();
  }, []);

  useEffect(() => {
    if (!runningWikiDrive) return;
    const timer = window.setInterval(() => { void loadWikiDrive(); }, 4000);
    return () => window.clearInterval(timer);
  }, [runningWikiDrive]);

  const loadFolders = async (parentId?: string | null) => {
    setLoadingFolders(true);
    try {
      const query = parentId ? `?parentId=${encodeURIComponent(parentId)}` : "";
      const response = await apiFetch(`/api/admin/wiki-drive-sync/folders${query}`);
      const data = await response?.json() as { folders: DriveFolder[]; parentId: string | null };
      setFolders(data.folders ?? []);
    } catch {
      toast({ title: "Could not browse Google Drive", variant: "destructive" });
    } finally {
      setLoadingFolders(false);
    }
  };

  const openFolderBrowser = () => {
    setFolderBrowserOpen(true);
    setFolderPath([]);
    void loadFolders();
  };

  const handleSaveWikiDrive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wikiDriveFolder.trim()) {
      toast({ title: "Enter a Google Drive folder link or ID", variant: "destructive" });
      return;
    }
    setSavingWikiDrive(true);
    try {
      const response = await apiFetch("/api/admin/wiki-drive-sync", {
        method: "PATCH",
        body: JSON.stringify({ sourceFolder: wikiDriveFolder.trim() }),
      });
      setWikiDrive(await response?.json() as WikiDriveConfig);
      toast({ title: "Wiki source folder saved" });
    } catch {
      toast({ title: "Failed to save Wiki source folder", variant: "destructive" });
    } finally {
      setSavingWikiDrive(false);
    }
  };

  const handleRunWikiDrive = async () => {
    setRunningWikiDrive(true);
    try {
      await apiFetch("/api/admin/wiki-drive-sync/run", {
        method: "POST",
        body: JSON.stringify({}),
      });
      toast({ title: "Wiki sync started" });
      await loadWikiDrive();
    } catch {
      setRunningWikiDrive(false);
      toast({ title: "Could not start Wiki sync", variant: "destructive" });
    }
  };

  const handleSaveSize = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseInt(maxSizeMb);
    if (isNaN(val) || val < 1) {
      toast({ title: "Please enter a valid size in MB", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await saveSetting("max_video_upload_size_mb", String(val));
      toast({ title: "Settings saved" });
    } catch {
      toast({ title: "Failed to save settings", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDriveFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingDriveFolder(true);
    try {
      await saveSetting("drive_upload_folder_url", driveFolderUrl.trim());
      toast({ title: "Drive folder URL saved" });
    } catch {
      toast({ title: "Failed to save setting", variant: "destructive" });
    } finally {
      setSavingDriveFolder(false);
    }
  };

  const handleToggleUpload = async () => {
    const next = !uploadEnabled;
    setSavingToggle(true);
    try {
      await saveSetting("video_upload_enabled", next ? "true" : "false");
      setUploadEnabled(next);
      toast({ title: `Video upload ${next ? "enabled" : "disabled"}` });
    } catch {
      toast({ title: "Failed to update setting", variant: "destructive" });
    } finally {
      setSavingToggle(false);
    }
  };

  const handleSaveCopy = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCopy(true);
    try {
      await Promise.all(editableCopyKeys.map(({ key }) => saveSetting(`copy.${key}`, copyValues[key] ?? "")));
      refresh();
      toast({ title: "Site text saved" });
    } catch {
      toast({ title: "Failed to save site text", variant: "destructive" });
    } finally {
      setSavingCopy(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading settings...</div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold font-serif">{copy("page.adminSettingsTitle")}</h1>
        <p className="text-muted-foreground mt-2">Configure platform-wide settings for the training portal.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Video Upload Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Enable/disable upload toggle */}
          <div className="flex items-center justify-between py-3 border-b border-border">
            <div>
              <p className="font-medium text-sm">Enable Direct Video Upload</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                When disabled, admins cannot upload videos directly to storage. Embed and Google Drive sources are unaffected.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={uploadEnabled}
              disabled={savingToggle}
              onClick={handleToggleUpload}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none disabled:opacity-50 ${
                uploadEnabled ? "bg-primary" : "bg-muted-foreground/30"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition-transform ${
                  uploadEnabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Max size input — only shown when upload is enabled */}
          {uploadEnabled && (
            <form onSubmit={handleSaveSize} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="max-size">Maximum Upload File Size (MB)</Label>
                <p className="text-xs text-muted-foreground">
                  Limits how large a single video file can be when uploaded directly to storage. Default is 500 MB.
                </p>
                <div className="flex items-center gap-3 max-w-xs">
                  <Input
                    id="max-size"
                    type="number"
                    min="1"
                    max="10000"
                    value={maxSizeMb}
                    onChange={e => setMaxSizeMb(e.target.value)}
                    className="max-w-[120px]"
                  />
                  <span className="text-sm text-muted-foreground">MB</span>
                </div>
              </div>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save Settings"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5" />
            Google Drive Wiki Sync
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Sync PDF files from each immediate subfolder into Wiki categories and articles every morning.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {loadingWikiDrive ? (
            <p className="text-sm text-muted-foreground">Loading Wiki sync settings...</p>
          ) : (
            <>
              <form onSubmit={handleSaveWikiDrive} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="wiki-drive-folder">Wiki source folder link or ID</Label>
                  <p className="text-xs text-muted-foreground">
                    Each immediate subfolder becomes a Wiki category. PDFs inside those folders become Wiki pages.
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      id="wiki-drive-folder"
                      value={wikiDriveFolder}
                      onChange={(e) => setWikiDriveFolder(e.target.value)}
                      placeholder="https://drive.google.com/drive/folders/... or folder ID"
                      className="min-w-0 flex-1"
                      aria-describedby="wiki-drive-folder-help"
                    />
                    {wikiDrive?.connectionConfigured && (
                      <Button type="button" variant="outline" onClick={openFolderBrowser}>
                        <FolderOpen className="mr-2 h-4 w-4" />
                        Browse Drive
                      </Button>
                    )}
                  </div>
                  <p id="wiki-drive-folder-help" className="text-xs text-muted-foreground">
                    {wikiDrive?.connectionConfigured
                      ? "You can paste a folder link or choose a folder from your connected Drive."
                      : "Connect Google Drive to browse folders, or paste a folder link/ID."}
                  </p>
                </div>
                <Button type="submit" disabled={savingWikiDrive || !wikiDriveFolder.trim()}>
                  {savingWikiDrive ? "Saving..." : "Save source folder"}
                </Button>
              </form>

              <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-medium text-sm">Sync status</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {wikiDrive?.status.state === "running"
                        ? "A sync is currently running."
                        : wikiDrive?.status.state === "success"
                          ? "Last sync completed successfully."
                          : wikiDrive?.status.state === "error"
                            ? "The last sync encountered an error."
                            : "No sync has run yet."}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleRunWikiDrive}
                    disabled={runningWikiDrive || !wikiDriveFolder.trim()}
                  >
                    <RefreshCw className={`mr-2 h-4 w-4 ${runningWikiDrive ? "animate-spin" : ""}`} />
                    {runningWikiDrive ? "Syncing..." : "Sync now"}
                  </Button>
                </div>
                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <span className="text-muted-foreground">Last sync:</span>{" "}
                    <span>{wikiDrive?.status.lastSyncedAt ? new Date(wikiDrive.status.lastSyncedAt).toLocaleString() : "Never"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Last attempted:</span>{" "}
                    <span>{wikiDrive?.status.lastAttemptedAt ? new Date(wikiDrive.status.lastAttemptedAt).toLocaleString() : "Never"}</span>
                  </div>
                </div>
                {wikiDrive?.status.summary && (
                  <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    {Object.entries(wikiDrive.status.summary).map(([label, value]) => (
                      <div key={label} className="rounded-md bg-background px-3 py-2">
                        <p className="capitalize text-muted-foreground">{label}</p>
                        <p className="text-base font-semibold">{value}</p>
                      </div>
                    ))}
                  </div>
                )}
                {wikiDrive?.status.state === "success" && (
                  <p className="flex items-center gap-2 text-xs text-green-700 dark:text-green-400">
                    <CheckCircle2 className="h-4 w-4" /> Wiki content is up to date with the source folder.
                  </p>
                )}
                {wikiDrive?.status.lastError && (
                  <p className="flex items-start gap-2 text-xs text-destructive" role="alert">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {wikiDrive.status.lastError}
                  </p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <Dialog open={folderBrowserOpen} onOpenChange={setFolderBrowserOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Choose Wiki source folder</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-1 text-sm">
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={() => { setFolderPath([]); void loadFolders(); }}
              >
                My Drive
              </button>
              {folderPath.map((item, index) => (
                <span key={item.id ?? "root"} className="flex items-center gap-1">
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  <button
                    type="button"
                    className="max-w-[160px] truncate text-primary hover:underline"
                    onClick={() => {
                      const next = folderPath.slice(0, index + 1);
                      setFolderPath(next);
                      void loadFolders(item.id);
                    }}
                  >
                    {item.name}
                  </button>
                </span>
              ))}
            </div>
            {loadingFolders ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Loading folders...</p>
            ) : folders.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No folders found here.</p>
            ) : (
              <div className="divide-y rounded-md border">
                {folders.map((folder) => (
                  <div key={folder.id} className="flex items-center justify-between gap-3 p-3">
                    <button
                      type="button"
                      className="flex min-w-0 items-center gap-2 text-left text-sm hover:text-primary"
                      onClick={() => {
                        setFolderPath((current) => [...current, { id: folder.id, name: folder.name }]);
                        void loadFolders(folder.id);
                      }}
                    >
                      <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{folder.name}</span>
                    </button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setWikiDriveFolder(folder.webViewLink || folder.id);
                        setFolderBrowserOpen(false);
                      }}
                    >
                      Select
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="w-5 h-5" />
            Google Drive Upload Folder
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveDriveFolder} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="drive-folder">Drive Folder URL</Label>
              <p className="text-xs text-muted-foreground">
                When set, a "Upload video to our Drive folder →" link appears above the Google Drive share link input whenever someone adds a video. Paste the URL of the shared Drive folder where videos should be uploaded.
              </p>
              <Input
                id="drive-folder"
                type="url"
                value={driveFolderUrl}
                onChange={e => setDriveFolderUrl(e.target.value)}
                placeholder="https://drive.google.com/drive/folders/..."
                className="max-w-lg"
              />
            </div>
            <Button type="submit" disabled={savingDriveFolder}>
              {savingDriveFolder ? "Saving..." : "Save"}
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Site Text
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Customize sidebar labels and key page titles. Leave a field blank to use the default text.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveCopy} className="space-y-6">
            {Array.from(new Set(editableCopyKeys.map((item) => item.group))).map((group) => (
              <div key={group} className="space-y-3">
                <h3 className="text-sm font-semibold">{group}</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  {editableCopyKeys.filter((item) => item.group === group).map(({ key, label }) => (
                    <div key={key} className="space-y-1.5">
                      <Label htmlFor={`copy-${key}`}>{label}</Label>
                      <Input
                        id={`copy-${key}`}
                        value={copyValues[key] ?? ""}
                        onChange={(e) => setCopyValues((current) => ({ ...current, [key]: e.target.value }))}
                        placeholder={SITE_COPY_DEFAULTS[key]}
                        maxLength={120}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <Button type="submit" disabled={savingCopy}>
              {savingCopy ? "Saving..." : "Save Site Text"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
