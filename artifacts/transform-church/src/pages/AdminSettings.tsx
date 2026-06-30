import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Settings, Upload } from "lucide-react";

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

async function saveSetting(key: string, value: string) {
  await apiFetch("/api/admin/settings", {
    method: "PATCH",
    body: JSON.stringify({ key, value }),
  });
}

export default function AdminSettings() {
  const { toast } = useToast();
  const [maxSizeMb, setMaxSizeMb] = useState("500");
  const [uploadEnabled, setUploadEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingToggle, setSavingToggle] = useState(false);

  useEffect(() => {
    apiFetch("/api/admin/settings")
      .then(r => r?.json())
      .then((settings: { key: string; value: string }[]) => {
        const sizeSetting = settings?.find(s => s.key === "max_video_upload_size_mb");
        if (sizeSetting) setMaxSizeMb(sizeSetting.value);
        const enabledSetting = settings?.find(s => s.key === "video_upload_enabled");
        if (enabledSetting) setUploadEnabled(enabledSetting.value !== "false");
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

  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading settings...</div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold font-serif">Admin Settings</h1>
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
    </div>
  );
}
