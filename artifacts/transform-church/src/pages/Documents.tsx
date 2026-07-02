import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, FolderOpen, ExternalLink, X } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type DriveResource = {
  id: number;
  groupId: number;
  groupName: string;
  label: string;
  driveUrl: string;
  resourceType: "file" | "folder";
  sortOrder: number;
};

function extractFileId(url: string): string | null {
  const m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

function previewUrl(resource: DriveResource): string | null {
  if (resource.resourceType !== "file") return null;
  const id = extractFileId(resource.driveUrl);
  return id ? `https://drive.google.com/file/d/${id}/preview` : null;
}

function PreviewModal({ resource, onClose }: { resource: DriveResource; onClose: () => void }) {
  const url = previewUrl(resource);
  if (!url) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-card shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-4 h-4 text-primary shrink-0" />
          <span className="font-medium truncate">{resource.label}</span>
          <Badge variant="secondary" className="text-xs shrink-0">{resource.groupName}</Badge>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm" variant="outline"
            onClick={() => window.open(resource.driveUrl, "_blank")}
          >
            <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
            Open in Drive
          </Button>
          <Button size="icon" variant="ghost" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
      <iframe
        src={url}
        className="flex-1 w-full border-0"
        title={resource.label}
        allow="autoplay"
      />
    </div>
  );
}

export default function Documents() {
  const [resources, setResources] = useState<DriveResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewResource, setPreviewResource] = useState<DriveResource | null>(null);

  useEffect(() => {
    fetch(`${BASE}/api/users/me/drive-resources`, { credentials: "include" })
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(setResources)
      .catch(() => setError("Failed to load documents"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-20 text-center text-muted-foreground">{error}</div>
    );
  }

  const byGroup = resources.reduce<Record<string, { groupName: string; items: DriveResource[] }>>(
    (acc, r) => {
      if (!acc[r.groupId]) acc[r.groupId] = { groupName: r.groupName, items: [] };
      acc[r.groupId].items.push(r);
      return acc;
    },
    {}
  );

  const groupEntries = Object.entries(byGroup);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {previewResource && (
        <PreviewModal resource={previewResource} onClose={() => setPreviewResource(null)} />
      )}

      <div>
        <h1 className="text-3xl font-bold font-serif">Training Documents</h1>
        <p className="text-muted-foreground mt-2">
          Documents and folders shared with your groups.
        </p>
      </div>

      {resources.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center">
            <FileText className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <h3 className="font-medium mb-1">No documents yet</h3>
            <p className="text-sm text-muted-foreground">
              Documents will appear here once your group managers add them.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {groupEntries.map(([groupId, { groupName, items }]) => (
            <div key={groupId}>
              {groupEntries.length > 1 && (
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  {groupName}
                </h2>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map(resource => (
                  <Card key={resource.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-5">
                      <div className="flex items-start gap-3 mb-4">
                        <div className={`mt-0.5 rounded-md p-2 ${resource.resourceType === "file" ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600"}`}>
                          {resource.resourceType === "file"
                            ? <FileText className="w-5 h-5" />
                            : <FolderOpen className="w-5 h-5" />
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium leading-snug line-clamp-2">{resource.label}</p>
                          <Badge variant="outline" className="mt-1.5 text-xs capitalize">
                            {resource.resourceType}
                          </Badge>
                        </div>
                      </div>

                      {resource.resourceType === "file" ? (
                        <Button
                          className="w-full h-8 text-sm"
                          onClick={() => setPreviewResource(resource)}
                        >
                          <FileText className="w-3.5 h-3.5 mr-1.5" />
                          Preview
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          className="w-full h-8 text-sm"
                          onClick={() => window.open(resource.driveUrl, "_blank")}
                        >
                          <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                          Open in Drive
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
