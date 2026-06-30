const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function resolveStorageUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (url.startsWith("/objects/")) return `${BASE}/api/storage${url}`;
  return url;
}
