export type FacilitiesRequest = {
  id: number;
  categoryId: number;
  eyebrow: string | null;
  title: string;
  description: string;
  useWhen: string | null;
  url: string;
  buttonLabel: string;
  icon: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type FacilitiesCategory = {
  id: number;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  requests: FacilitiesRequest[];
};

export type FacilitiesAccessGrant = {
  id: number;
  userId: string;
  grantedByExternalUserId: string;
  grantedAt: string;
};

export type FacilitiesGroupAccessGrant = {
  id: number;
  groupId: number;
  groupName: string;
  memberCount: number;
  grantedByExternalUserId: string;
  grantedAt: string;
};

export type FacilitiesGroup = {
  id: number;
  name: string;
  description: string | null;
  memberCount: number;
};

const BASE = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? import.meta.env.BASE_URL.replace(/\/$/, "");

export async function facilitiesApi<T>(path: string, options?: RequestInit): Promise<T> {
  const token = sessionStorage.getItem("auth_bearer_token");
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  const payload = response.status === 204
    ? null
    : await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload?.error || "The request could not be completed.");
  }
  return payload as T;
}

export const facilitiesIconOptions = [
  { value: "wrench", label: "Wrench" },
  { value: "alert-triangle", label: "Alert" },
  { value: "building", label: "Building" },
  { value: "truck", label: "Transportation" },
  { value: "coffee", label: "Kitchen" },
  { value: "megaphone", label: "Communications" },
  { value: "monitor", label: "Technology" },
  { value: "headphones", label: "Production" },
  { value: "clipboard", label: "General request" },
] as const;