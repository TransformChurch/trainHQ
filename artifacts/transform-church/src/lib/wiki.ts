export type WikiArticleSummary = {
  id: number;
  categoryId: number;
  slug: string;
  title: string;
  summary: string | null;
  sortOrder: number;
};

export type WikiArticle = {
  id: number;
  categoryId: number;
  slug: string;
  title: string;
  summary: string | null;
  content: string;
  sortOrder: number;
  isActive: boolean;
  driveSourceUrl: string | null;
  driveModifiedAt: string | null;
  categoryName: string;
  categorySlug: string;
};

export type WikiCategory = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  articles: WikiArticleSummary[];
};

export type WikiAdminArticle = {
  id: number;
  categoryId: number;
  slug: string;
  title: string;
  summary: string | null;
  content: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WikiAdminCategory = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  articles: WikiAdminArticle[];
};

const BASE = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? import.meta.env.BASE_URL.replace(/\/$/, "");

export async function wikiApi<T>(path: string, options?: RequestInit): Promise<T> {
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
