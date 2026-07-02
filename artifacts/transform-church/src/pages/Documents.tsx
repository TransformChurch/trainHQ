import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, FolderOpen, ExternalLink, X, Lock } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type RepoDoc = {
  id: number;
  title: string;
  description: string | null;
  driveUrl: string | null;
  resourceType: "file" | "folder";
  parentId: number | null;
  createdAt: string;
};

function extractFileId(url: string): string | null {
  const m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

function previewUrl(driveUrl: string): string | null {
  const id = extractFileId(driveUrl);
  return id ? `https://drive.google.com/file/d/${id}/preview` : null;
}

function PreviewModal({ doc, onClose }: { doc: RepoDoc; onClose: () => void }) {
  if (!doc.driveUrl) return null;
  const url = previewUrl(doc.driveUrl);
  if (!url) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-card shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-4 h-4 text-primary shrink-0" />
          <span className="font-medium truncate">{doc.title}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={() => window.open(doc.driveUrl!, "_blank")}>
            <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Open in Drive
          </Button>
          <Button size="icon" variant="ghost" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
      <iframe src={url} className="flex-1 w-full border-0" title={doc.title} allow="autoplay" />
    </div>
  );
}

export default function Documents() {
  const [docs, setDocs] = useState<RepoDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<RepoDoc | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<number | "all">("all");

  useEffect(() => {
    fetch(`${BASE}/api/documents`, { credentials: "include" })
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(setDocs)
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
    return <div className="py-20 text-center text-muted-foreground">{error}</div>;
  }

  const folders = docs.filter(d => d.resourceType === "folder");
  const fileDocs = docs.filter(d => d.resourceType === "file");

  const visibleDocs = selectedFolder === "all" ? fileDocs : fileDocs.filter(d => d.parentId === selectedFolder);
  const folderCount = (id: number) => fileDocs.filter(d => d.parentId === id).length;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {preview && <PreviewModal doc={preview} onClose={() => setPreview(null)} />}

      <div>
        <h1 className="text-3xl font-bold font-serif">Training Documents</h1>
        <p className="text-muted-foreground mt-2">Documents and resources shared with you.</p>
      </div>

      {fileDocs.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center">
            <Lock className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <h3 className="font-medium mb-1">No documents yet</h3>
            <p className="text-sm text-muted-foreground">
              Documents will appear here once they've been shared with you.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex gap-6">
          {/* Folder nav (only show if there are folders) */}
          {folders.length > 0 && (
            <div className="w-48 shrink-0 space-y-0.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">Browse</p>
              <button
                onClick={() => setSelectedFolder("all")}
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between gap-2 ${selectedFolder === "all" ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`}
              >
                <span>All Documents</span>
                <Badge variant="secondary" className="text-xs h-4 px-1">{fileDocs.length}</Badge>
              </button>
              {folders.map(f => (
                <button
                  key={f.id}
                  onClick={() => setSelectedFolder(f.id)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between gap-2 ${selectedFolder === f.id ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`}
                >
                  <span className="flex items-center gap-1.5"><FolderOpen className="w-3.5 h-3.5 shrink-0" />{f.title}</span>
                  {folderCount(f.id) > 0 && <Badge variant="secondary" className="text-xs h-4 px-1">{folderCount(f.id)}</Badge>}
                </button>
              ))}
            </div>
          )}

          {/* Document grid */}
          <div className="flex-1 min-w-0">
            {selectedFolder !== "all" && (
              <div className="mb-4">
                <h2 className="font-semibold">{folders.find(f => f.id === selectedFolder)?.title}</h2>
                {folders.find(f => f.id === selectedFolder)?.description && (
                  <p className="text-sm text-muted-foreground mt-0.5">{folders.find(f => f.id === selectedFolder)?.description}</p>
                )}
              </div>
            )}
            {visibleDocs.length === 0 ? (
              <div className="border border-dashed rounded-lg p-10 text-center text-muted-foreground">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No documents in this folder yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {visibleDocs.map(doc => (
                  <Card key={doc.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-5">
                      <div className="flex items-start gap-3 mb-4">
                        <div className="mt-0.5 rounded-md p-2 bg-blue-50 text-blue-600 shrink-0">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium leading-snug line-clamp-2">{doc.title}</p>
                          {doc.description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{doc.description}</p>
                          )}
                        </div>
                      </div>
                      {doc.driveUrl && previewUrl(doc.driveUrl) ? (
                        <Button className="w-full h-8 text-sm" onClick={() => setPreview(doc)}>
                          <FileText className="w-3.5 h-3.5 mr-1.5" /> Preview
                        </Button>
                      ) : doc.driveUrl ? (
                        <Button variant="outline" className="w-full h-8 text-sm" onClick={() => window.open(doc.driveUrl!, "_blank")}>
                          <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Open in Drive
                        </Button>
                      ) : null}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
