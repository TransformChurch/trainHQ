// Shared fetch helper for the tool pages (Reporting, Messaging, Tool
// Management): same-origin API base + the bearer token kept in sessionStorage.
export const BASE = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? import.meta.env.BASE_URL.replace(/\/$/, "");

export async function api(path: string, options?: RequestInit): Promise<Response> {
  const token = sessionStorage.getItem("auth_bearer_token");
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "Request failed." }));
    throw new Error(body.error || "Request failed.");
  }
  return response;
}
