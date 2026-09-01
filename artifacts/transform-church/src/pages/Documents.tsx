import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, FolderOpen, ExternalLink, X, Lock, AlertTriangle } from "lucide-react";
import { useSiteCopy } from "@/lib/siteCopy";

const BASE = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? import.meta.env.BASE_URL.replace(/\/$/, "");

type RepoDoc = {
  id: number;
  title: string;
  description: string | null;
  driveUrl: string | null;
  mimeType: string | null;
  resourceType: "file" | "folder";
  parentId: number | null;
  createdAt: string;
};

function fileExtension(doc: Pick<RepoDoc, "title" | "mimeType">): string | null {
  const titleExtension = doc.title.trim().match(/\.([a-z0-9]{1,12})$/i)?.[1];
  if (titleExtension) return titleExtension.toUpperCase();
  const mimeExtension: Record<string, string> = {
    "application/pdf": "PDF",
    "image/jpeg": "JPG",
    "image/png": "PNG",
    "image/gif": "GIF",
    "image/webp": "WEBP",
    "text/plain": "TXT",
    "text/csv": "CSV",
    "application/msword": "DOC",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
    "application/vnd.ms-excel": "XLS",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
    "application/vnd.ms-powerpoint": "PPT",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PPTX",
    "application/zip": "ZIP",
  };
  return doc.mimeType ? mimeExtension[doc.mimeType] ?? null : null;
}

function displayFileName(doc: RepoDoc): string {
  if (/\.[a-z0-9]{1,12}$/i.test(doc.title.trim())) return doc.title;
  const extension = fileExtension(doc);
  return extension ? `${doc.title}.${extension.toLowerCase()}` : doc.title;
}

function isPdf(doc: RepoDoc): boolean {
  return doc.mimeType === "application/pdf" || fileExtension(doc) === "PDF";
}

function extractFileId(url: string): string | null {
  const m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

function PreviewModal({ doc, onClose }: { doc: RepoDoc; onClose: () => void }) {
  const [iframeError, setIframeError] = useState(false);

  if (!doc.driveUrl) return null;
  const fileId = extractFileId(doc.driveUrl);
  const embedUrl = fileId ? `https://drive.google.com/file/d/${fileId}/preview` : null;

  const ErrorState = (
    <div className="flex-1 flex items-center justify-center flex-col gap-4 px-6 text-center">
      <AlertTriangle className="w-12 h-12 text-amber-400 opacity-80" />
      <div className="space-y-1">
        <p className="font-medium">This file couldn't be previewed</p>
        <p className="text-sm text-muted-foreground max-w-sm">
          The file may not be publicly shared or the link may be incorrect. Try opening it directly in Google Drive.
        </p>
      </div>
      <Button variant="outline" onClick={() => window.open(doc.driveUrl!, "_blank")}>
        <ExternalLink className="w-4 h-4 mr-2" /> Open in Google Drive
      </Button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-card shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-4 h-4 text-primary shrink-0" />
          <span className="font-medium truncate">{doc.title}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!iframeError && (
            <Button size="sm" variant="outline" onClick={() => window.open(doc.driveUrl!, "_blank")}>
              <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Open in Drive
            </Button>
          )}
          <Button size="icon" variant="ghost" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
      {iframeError || !embedUrl ? (
        embedUrl ? ErrorState : (
          <div className="flex-1 flex items-center justify-center flex-col gap-4 text-muted-foreground">
            <FileText className="w-12 h-12 opacity-40" />
            <p className="text-sm">Preview not available for this file type.</p>
            <Button variant="outline" onClick={() => window.open(doc.driveUrl!, "_blank")}>
              <ExternalLink className="w-4 h-4 mr-2" /> Open in Google Drive
            </Button>
          </div>
        )
      ) : (
        <div className="flex-1 flex flex-col relative">
          <iframe
            src={embedUrl}
            className="flex-1 w-full border-0"
            title={doc.title}
            allow="autoplay"
            onError={() => setIframeError(true)}
          />
          <div className="flex justify-center py-2 border-t bg-card shrink-0">
            <button
              className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
              onClick={() => setIframeError(true)}
            >
              Not loading? The file may not be publicly shared.
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DocumentCard({ doc, onPreview }: { doc: RepoDoc; onPreview: (d: RepoDoc) => void }) {
  const fileId = doc.driveUrl ? extractFileId(doc.driveUrl) : null;
  const canPreview = isPdf(doc) && !!fileId;

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="mt-0.5 rounded-md p-2 bg-blue-50 text-blue-600 shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <p className="font-medium leading-snug line-clamp-2">{displayFileName(doc)}</p>
              {fileExtension(doc) && (
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border rounded px-1.5 py-0.5 shrink-0">
                  {fileExtension(doc)}
                </span>
              )}
            </div>
            {doc.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{doc.description}</p>
            )}
          </div>
        </div>
        {doc.driveUrl && (
          canPreview ? (
            <Button className="w-full h-8 text-sm" onClick={() => onPreview(doc)}>
              <FileText className="w-3.5 h-3.5 mr-1.5" /> Preview
            </Button>
          ) : (
            <Button variant="outline" className="w-full h-8 text-sm" onClick={() => window.open(doc.driveUrl!, "_blank")}>
              <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Open in Drive
            </Button>
          )
        )}
      </CardContent>
    </Card>
  );
}

export default function Documents() {
  const { copy } = useSiteCopy();
  const [allDocs, setAllDocs] = useState<RepoDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<RepoDoc | null>(null);

  useEffect(() => {
    fetch(`${BASE}/api/documents`, {
      headers: sessionStorage.getItem("auth_bearer_token")
        ? { Authorization: `Bearer ${sessionStorage.getItem("auth_bearer_token")}` }
        : {},
    })
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(setAllDocs)
      .catch(() => setError("Failed to load documents"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (error) {
    return <div className="py-24 text-center text-muted-foreground">{error}</div>;
  }

  const folders = allDocs.filter(d => d.resourceType === "folder");
  const fileDocs = allDocs.filter(d => d.resourceType === "file");

  // Unfiled = file docs with no parent or whose parent isn't in the returned list
  const folderIds = new Set(folders.map(f => f.id));
  const unfiledDocs = fileDocs.filter(d => !d.parentId || !folderIds.has(d.parentId));

  // Group by folder (only folders present in the returned list)
  const folderSections = folders
    .map(f => ({ ...f, documents: fileDocs.filter(d => d.parentId === f.id) }))
    .filter(f => f.documents.length > 0);

  const hasContent = unfiledDocs.length > 0 || folderSections.length > 0;

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      {preview && <PreviewModal doc={preview} onClose={() => setPreview(null)} />}

      <div>
        <h1 className="text-3xl font-bold font-serif">{copy("page.documentsTitle")}</h1>
        <p className="text-muted-foreground mt-2">Resources and documents shared with you.</p>
      </div>

      {!hasContent ? (
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
        <div className="space-y-10">
          {/* Unfiled documents appear first */}
          {unfiledDocs.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold">Documents</h2>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {unfiledDocs.map(doc => (
                  <DocumentCard key={doc.id} doc={doc} onPreview={setPreview} />
                ))}
              </div>
            </section>
          )}

          {/* Folder sections */}
          {folderSections.map(folder => (
            <section key={folder.id} className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-5 h-5 text-amber-500" />
                  <h2 className="text-lg font-semibold">{folder.title}</h2>
                </div>
                {folder.description && (
                  <span className="text-sm text-muted-foreground">— {folder.description}</span>
                )}
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {folder.documents.map(doc => (
                  <DocumentCard key={doc.id} doc={doc} onPreview={setPreview} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
