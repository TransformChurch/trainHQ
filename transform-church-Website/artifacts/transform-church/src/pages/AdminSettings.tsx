import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Settings, Upload, HardDrive } from "lucide-react";
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
