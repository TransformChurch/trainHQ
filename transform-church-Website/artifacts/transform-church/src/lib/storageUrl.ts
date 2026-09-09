import { createElement, useEffect, useState, type ComponentProps } from "react";
import { customFetch } from "@workspace/api-client-react";

/**
 * Converts an authenticated private object into a short-lived browser blob URL.
 * External and public URLs are returned unchanged.
 */
export function useStorageUrl(url: string | null | undefined): string {
  const [resolvedUrl, setResolvedUrl] = useState("");

  useEffect(() => {
    if (!url) {
      setResolvedUrl("");
      return;
    }
    if (!url.startsWith("/objects/")) {
      setResolvedUrl(url);
      return;
    }

    let active = true;
    let objectUrl = "";
    customFetch<Blob>(`/api/storage${url}`, { responseType: "blob" })
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setResolvedUrl(objectUrl);
      })
      .catch(() => {
        if (active) setResolvedUrl("");
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  return resolvedUrl;
}

export function StorageImage({
  src,
  ...props
}: Omit<ComponentProps<"img">, "src"> & {
  src: string | null | undefined;
}) {
  const resolvedUrl = useStorageUrl(src);
  return createElement("img", { ...props, src: resolvedUrl });
}
