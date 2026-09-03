import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Switch, Route, Redirect, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import Home from "@/pages/Home";
import Dashboard from "@/pages/Dashboard";
import Tracks from "@/pages/Tracks";
import TrackDetail from "@/pages/TrackDetail";
import ModuleDetail from "@/pages/ModuleDetail";
import WatchVideo from "@/pages/WatchVideo";
import Queue from "@/pages/Queue";
import History from "@/pages/History";
import AdminDashboard from "@/pages/AdminDashboard";
import AdminUsers from "@/pages/AdminUsers";
import AdminContent from "@/pages/AdminContent";
import AdminGrowthTracks from "@/pages/AdminGrowthTracks";
import AdminSettings from "@/pages/AdminSettings";
import Profile from "@/pages/Profile";
import Groups from "@/pages/Groups";
import Documents from "@/pages/Documents";
import Facilities from "@/pages/Facilities";
import AdminFacilities from "@/pages/AdminFacilities";
import Reporting from "@/pages/Reporting";
import NotFound from "@/pages/not-found";
import { useUpsertMe, useGetMe } from "@workspace/api-client-react";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import { SiteCopyProvider } from "@/lib/siteCopy";

const queryClient = new QueryClient();
const TOKEN_STORAGE_KEY = "auth_bearer_token";
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const apiUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, "") || null;

type AuthUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
};
type AuthContextValue = {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: AuthUser | null;
  signOut: () => void;
};
const AuthContext = createContext<AuthContextValue>({
  isLoaded: false, isSignedIn: false, user: null, signOut: () => undefined,
});

function readTokenUser(token: string | null): AuthUser | null {
  if (!token) return null;
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const normalized = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    const payload = JSON.parse(atob(normalized)) as Record<string, unknown>;
    if (typeof payload.sub !== "string" || !payload.sub) return null;
    if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp) || payload.exp <= Date.now() / 1000) return null;
    const text = (...keys: string[]) => {
      for (const key of keys) if (typeof payload[key] === "string") return payload[key] as string;
      return "";
    };
    return {
      id: payload.sub,
      firstName: text("given_name", "firstName"),
      lastName: text("family_name", "lastName"),
      email: text("email"),
      phone: text("phone_number", "phone") || null,
    };
  } catch {
    return null;
  }
}

function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem(TOKEN_STORAGE_KEY));
  const user = useMemo(() => readTokenUser(token), [token]);

  useEffect(() => {
    const values = new URLSearchParams(window.location.hash.slice(1));
    const callbackToken = values.get("access_token") ?? values.get("token");
    if (!callbackToken) return;
    sessionStorage.setItem(TOKEN_STORAGE_KEY, callbackToken);
    setToken(callbackToken);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }, []);

  useEffect(() => {
    setAuthTokenGetter(() => token);
    return () => setAuthTokenGetter(null);
  }, [token]);
  useEffect(() => {
    setBaseUrl(apiUrl);
    return () => setBaseUrl(null);
  }, []);

  const signOut = () => {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
  };
  return <AuthContext.Provider value={{ isLoaded: true, isSignedIn: !!user, user, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

function AuthShell({ children }: { children: ReactNode }) {
  return <div className="flex min-h-[100dvh] items-center justify-center bg-muted/30 px-4 py-12 relative overflow-hidden">
    <div className="absolute inset-0 bg-primary/5 pointer-events-none" />
    <div className="z-10 w-full max-w-md flex flex-col items-center gap-6">
      <img src={`${basePath}/tc-wordmark.png`} alt="Transform Church" className="h-10 w-auto" />
      {children}
    </div>
  </div>;
}

function SignInPage() {
  const { isSignedIn } = useAuth();
  const loginUrl = import.meta.env.VITE_AUTH_LOGIN_URL || "/api/auth/planning-center/start";
  const errorCode = new URLSearchParams(window.location.search).get("auth_error");
  const errorMessages: Record<string, string> = {
    planning_center_access_denied: "Church Center access was not approved. You can try again when you are ready.",
    invalid_oauth_state: "That sign-in request expired. Please start again.",
    planning_center_profile_email_missing: "Your Planning Center profile needs an email address before you can sign in.",
    planning_center_permission_error: "Planning Center did not grant the required People access.",
    planning_center_not_configured: "Church Center sign-in has not been configured.",
    planning_center_account_link_required: "A matching local account already exists. Ask an administrator to link it to Church Center.",
    planning_center_identity_conflict: "This Church Center identity conflicts with another account. Ask an administrator for help.",
  };

  const handleSignIn = () => {
    if (!loginUrl) return;
    const target = new URL(loginUrl, window.location.origin);
    if (!target.searchParams.has("return_to")) {
      const returnPath = `${basePath}/sign-in`;
      target.searchParams.set(
        "return_to",
        target.origin === window.location.origin
          ? returnPath
          : `${window.location.origin}${returnPath}`,
      );
    }
    window.location.assign(target.toString());
  };

  if (isSignedIn) return <Redirect to="/dashboard" />;
  return (
    <AuthShell>
      <div className="w-full rounded-xl border bg-card p-6 text-center shadow-sm">
        <h1 className="text-2xl font-bold font-serif">Welcome back</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Use your Church Center account to access your training.
        </p>
        {errorCode && (
          <div className="mt-5 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-left text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{errorMessages[errorCode] ?? "Church Center sign-in could not be completed. Please try again."}</span>
          </div>
        )}
        <Button
          className="mt-6 w-full"
          size="lg"
          onClick={handleSignIn}
          disabled={!loginUrl}
        >
          Log in with Church Center
        </Button>
        {!loginUrl && (
          <p className="mt-3 text-xs text-muted-foreground">
            Sign-in has not been configured. Set VITE_AUTH_LOGIN_URL and rebuild the frontend.
          </p>
        )}
      </div>
    </AuthShell>
  );
}

function QueryCacheInvalidator() {
  const { user } = useAuth();
  const client = useQueryClient();
  const previous = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (previous.current !== undefined && previous.current !== (user?.id ?? null)) client.clear();
    previous.current = user?.id ?? null;
  }, [user?.id, client]);
  return null;
}

const UserSyncContext = createContext<{ synced: boolean }>({ synced: false });
function UserSyncProvider({ children }: { children: ReactNode }) {
  const { user, isLoaded, isSignedIn } = useAuth();
  const { mutate: upsertMe } = useUpsertMe();
  const client = useQueryClient();
  const syncedFor = useRef<string | null>(null);
  const [synced, setSynced] = useState(false);
  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn || !user) { setSynced(true); return; }
    if (syncedFor.current === user.id) return;
    syncedFor.current = user.id;
    setSynced(false);
    upsertMe({ data: { firstName: user.firstName, lastName: user.lastName, email: user.email, phone: user.phone } }, {
      onSuccess: () => { client.invalidateQueries(); setSynced(true); },
      onError: () => setSynced(true),
    });
  }, [isLoaded, isSignedIn, user, upsertMe, client]);
  return <UserSyncContext.Provider value={{ synced }}>{children}</UserSyncContext.Provider>;
}

function Spinner() {
  return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
}

function ProtectedRoute({ component: Component, adminOnly = false, managerOrAdmin = false }: { component: any; adminOnly?: boolean; managerOrAdmin?: boolean }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { synced } = useContext(UserSyncContext);
  const { data: me, isLoading: meLoading } = useGetMe();
  if (!isLoaded) return <Spinner />;
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  if (!synced) return <Spinner />;
  if ((adminOnly || managerOrAdmin) && meLoading) return <Spinner />;
  if (adminOnly && me) {
    if (me.role === "manager") return <Redirect to="/admin/users" />;
    if (me.role === "student") return <Redirect to="/dashboard" />;
  }
  if (managerOrAdmin && me?.role === "student") return <Redirect to="/dashboard" />;
  return <AppLayout><Component /></AppLayout>;
}

function HomeRedirect() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <Spinner />;
  return isSignedIn ? <Redirect to="/dashboard" /> : <Home />;
}

function AppRoutes() {
  return <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <QueryCacheInvalidator />
      <SiteCopyProvider>
      <UserSyncProvider>
        <Switch>
          <Route path="/" component={HomeRedirect} />
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignInPage} />
          <Route path="/dashboard"><ProtectedRoute component={Dashboard} /></Route>
          <Route path="/tracks"><ProtectedRoute component={Tracks} /></Route>
          <Route path="/tracks/:trackId"><ProtectedRoute component={TrackDetail} /></Route>
          <Route path="/modules/:moduleId"><ProtectedRoute component={ModuleDetail} /></Route>
          <Route path="/watch/:videoId"><ProtectedRoute component={WatchVideo} /></Route>
          <Route path="/queue"><ProtectedRoute component={Queue} /></Route>
          <Route path="/history"><ProtectedRoute component={History} /></Route>
          <Route path="/profile"><ProtectedRoute component={Profile} /></Route>
          <Route path="/groups"><ProtectedRoute component={Groups} /></Route>
          <Route path="/documents"><ProtectedRoute component={Documents} /></Route>
          <Route path="/facilities"><ProtectedRoute component={Facilities} /></Route>
          <Route path="/reporting"><ProtectedRoute component={Reporting} managerOrAdmin /></Route>
          <Route path="/admin"><ProtectedRoute component={AdminDashboard} adminOnly /></Route>
          <Route path="/admin/users"><ProtectedRoute component={AdminUsers} managerOrAdmin /></Route>
          <Route path="/admin/content"><Redirect to="/admin/modules" /></Route>
          <Route path="/admin/modules"><ProtectedRoute component={() => <AdminContent section="modules" />} managerOrAdmin /></Route>
          <Route path="/admin/documents"><ProtectedRoute component={() => <AdminContent section="documents" />} managerOrAdmin /></Route>
          <Route path="/admin/growth-tracks"><ProtectedRoute component={AdminGrowthTracks} managerOrAdmin /></Route>
          <Route path="/admin/settings"><ProtectedRoute component={AdminSettings} adminOnly /></Route>
          <Route path="/admin/facilities"><ProtectedRoute component={AdminFacilities} adminOnly /></Route>
          <Route component={NotFound} />
        </Switch>
      </UserSyncProvider>
      </SiteCopyProvider>
    </AuthProvider>
  </QueryClientProvider>;
}

export default function App() {
  return <TooltipProvider><WouterRouter base={basePath}><AppRoutes /></WouterRouter><Toaster /></TooltipProvider>;
}