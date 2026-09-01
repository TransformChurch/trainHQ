import { useState } from "react";
import { AlertTriangle, ExternalLink, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

type DocumentViewerProps = {
  title: string;
  url: string;
  mimeType?: string | null;
};

function getDriveFileId(url: string): string | null {
  const pathMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (pathMatch) return pathMatch[1];

  try {
    const parsed = new URL(url);
    if (parsed.hostname === "drive.google.com") {
      return parsed.searchParams.get("id");
    }
  } catch {
    return null;
  }

  return null;
}

function getViewerUrl(url: string): string | null {
  const driveFileId = getDriveFileId(url);
  if (driveFileId) {
    return `https://drive.google.com/file/d/${driveFileId}/preview`;
  }

  return null;
}

export function DocumentViewer({ title, url, mimeType }: DocumentViewerProps) {
  const [showError, setShowError] = useState(false);
  const viewerUrl = getViewerUrl(url);
  const isPdf = mimeType === "application/pdf" || /\.pdf$/i.test(title.trim());

  if (!isPdf) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-xl border bg-muted/20 px-6 text-center">
        <FileText className="h-12 w-12 text-muted-foreground/50" />
        <div className="space-y-1">
          <h2 className="font-semibold">{title}</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Preview is available for PDF files only. Open this file in Google Drive to view or download it.
          </p>
        </div>
        <Button variant="outline" asChild>
          <a href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-2 h-4 w-4" />
            Open file
          </a>
        </Button>
      </div>
    );
  }

  if (!viewerUrl || showError) {
    return (
      <div className="flex min-h-[420px] flex-col items-center justify-center gap-4 rounded-xl border bg-muted/20 px-6 text-center">
        <AlertTriangle className="h-12 w-12 text-amber-500" />
        <div className="space-y-1">
          <h2 className="font-semibold">This document couldn&apos;t be displayed</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            The file may not be publicly shared, or the link may no longer be valid.
          </p>
        </div>
        <Button variant="outline" asChild>
          <a href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-2 h-4 w-4" />
            Open document
          </a>
        </Button>
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-4 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate text-sm font-medium">{title}</span>
        </div>
        <Button size="sm" variant="outline" asChild>
          <a href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            Open
          </a>
        </Button>
      </div>
      <iframe
        src={viewerUrl}
        title={`${title} PDF viewer`}
        className="h-[72vh] min-h-[560px] w-full border-0 bg-white"
        allow="autoplay"
        onError={() => setShowError(true)}
      />
      <div className="flex justify-center border-t px-4 py-2">
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground hover:underline"
          onClick={() => setShowError(true)}
        >
          Document not loading?
        </button>
      </div>
    </section>
  );
}