import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export const SITE_COPY_DEFAULTS = {
  "nav.dashboard": "Dashboard",
  "nav.trainingTracks": "Training Tracks",
  "nav.myQueue": "My Queue",
  "nav.groups": "Groups",
  "nav.myProfile": "My Profile",
  "nav.documents": "Documents",
  "nav.wiki": "Wiki",
  "nav.requestHub": "Request Hub",
  "nav.usersProgress": "Users & Progress",
  "nav.moduleManager": "Module Manager",
  "nav.documentManager": "Document Manager",
  "nav.growthTracks": "Growth Tracks",
  "nav.adminDashboard": "Admin Dashboard",
  "nav.adminSettings": "Admin Settings",
  "nav.signOut": "Sign out",
  "page.moduleManagerTitle": "Module Manager",
  "page.documentManagerTitle": "Document Manager",
  "page.trainingTracksTitle": "Training Tracks",
  "page.documentsTitle": "Training Documents",
  "page.adminSettingsTitle": "Admin Settings",
} as const;

export type SiteCopyKey = keyof typeof SITE_COPY_DEFAULTS;
type SiteCopyValues = Partial<Record<SiteCopyKey, string>>;

const SiteCopyContext = createContext<{
  copy: (key: SiteCopyKey) => string;
  refresh: () => void;
}>({
  copy: (key) => SITE_COPY_DEFAULTS[key],
  refresh: () => undefined,
});

const apiBase = import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "";

export function SiteCopyProvider({ children }: { children: ReactNode }) {
  const [values, setValues] = useState<SiteCopyValues>({});
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`${apiBase}/api/site-copy`)
      .then((response) => response.ok ? response.json() : {})
      .then((next: SiteCopyValues) => {
        if (!cancelled) setValues(next ?? {});
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [refreshToken]);

  const contextValue = useMemo(() => ({
    copy: (key: SiteCopyKey) => values[key]?.trim() || SITE_COPY_DEFAULTS[key],
    refresh: () => setRefreshToken((current) => current + 1),
  }), [values]);

  return <SiteCopyContext.Provider value={contextValue}>{children}</SiteCopyContext.Provider>;
}

export function useSiteCopy() {
  return useContext(SiteCopyContext);
}