import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronRight, FolderOpen, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/toolApi";

// Google Drive Wiki Sync setup (admin only) -- moved here from Admin Settings
// so every tool's admin controls live on the Tool Management page.

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

export function WikiDriveSyncCard() {
  const { toast } = useToast();
  const [wikiDrive, setWikiDrive] = useState<WikiDriveConfig | null>(null);
  const [wikiDriveFolder, setWikiDriveFolder] = useState("");
  const [loadingWikiDrive, setLoadingWikiDrive] = useState(true);
  const [savingWikiDrive, setSavingWikiDrive] = useState(false);
  const [runningWikiDrive, setRunningWikiDrive] = useState(false);
  const [folderBrowserOpen, setFolderBrowserOpen] = useState(false);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [folderPath, setFolderPath] = useState<{ id: string | null; name: string }[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);

  const loadWikiDrive = async () => {
    try {
      const response = await api("/api/admin/wiki-drive-sync");
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
      const response = await api(`/api/admin/wiki-drive-sync/folders${query}`);
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
      const response = await api("/api/admin/wiki-drive-sync", {
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
      await api("/api/admin/wiki-drive-sync/run", {
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

  return (
    <>
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
    </>
  );
}
