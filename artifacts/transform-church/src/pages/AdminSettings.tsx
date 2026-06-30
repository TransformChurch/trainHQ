import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Settings } from "lucide-react";

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

export default function AdminSettings() {
  const { toast } = useToast();
  const [maxSizeMb, setMaxSizeMb] = useState("500");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch("/api/admin/settings")
      .then(r => r?.json())
      .then((settings: { key: string; value: string }[]) => {
        const setting = settings?.find(s => s.key === "max_video_upload_size_mb");
        if (setting) setMaxSizeMb(setting.value);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseInt(maxSizeMb);
    if (isNaN(val) || val < 1) {
      toast({ title: "Please enter a valid size in MB", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/api/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({ key: "max_video_upload_size_mb", value: String(val) }),
      });
      toast({ title: "Settings saved" });
    } catch {
      toast({ title: "Failed to save settings", variant: "destructive" });
    } finally {
      setSaving(false);
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
            <Settings className="w-5 h-5" />
            Video Upload Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
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
        </CardContent>
      </Card>
    </div>
  );
}
