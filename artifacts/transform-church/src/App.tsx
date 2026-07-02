import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Switch, Route, Redirect, useLocation, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useUser } from "@clerk/react";
import { shadcn } from "@clerk/themes";

// Layouts and Pages
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
import NotFound from "@/pages/not-found";
import { useUpsertMe, useGetMe } from "@workspace/api-client-react";

const queryClient = new QueryClient();

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in .env file");
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/tc-wordmark.png`,
  },
  variables: {
    colorPrimary: "hsl(43 96% 56%)",
    colorForeground: "hsl(222 47% 11%)",
    colorMutedForeground: "hsl(215 16% 47%)",
    colorDanger: "hsl(0 84% 60%)",
    colorBackground: "hsl(40 33% 98%)",
    colorInput: "hsl(214 32% 91%)",
    colorInputForeground: "hsl(222 47% 11%)",
    colorNeutral: "hsl(214 32% 91%)",
    fontFamily: "'Inter', sans-serif",
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-background border border-border rounded-xl w-[440px] max-w-full overflow-hidden shadow-lg",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-foreground font-serif text-2xl font-bold",
    headerSubtitle: "text-muted-foreground",
    socialButtonsBlockButtonText: "text-foreground font-medium",
    formFieldLabel: "text-foreground font-medium",
    footerActionLink: "text-primary hover:text-primary/80 transition-colors font-medium",
    footerActionText: "text-muted-foreground",
    dividerText: "text-muted-foreground bg-background px-2",
    identityPreviewEditButton: "text-primary hover:text-primary/80",
    formFieldSuccessText: "text-green-600",
    alertText: "text-destructive-foreground",
    logoBox: "flex justify-center mb-4",
    logoImage: "h-12 w-auto",
    socialButtonsBlockButton: "border border-input hover:bg-muted bg-background text-foreground",
    formButtonPrimary: "bg-primary text-primary-foreground hover:bg-primary/90",
    formFieldInput: "border border-input bg-background text-foreground focus:ring-2 focus:ring-ring focus:outline-none",
    footerAction: "bg-muted/50 p-4 border-t border-border",
    dividerLine: "bg-border",
    alert: "bg-destructive text-destructive-foreground border-destructive",
    otpCodeFieldInput: "border-input bg-background text-foreground focus:ring-ring",
    formFieldRow: "mb-4",
    main: "p-6",
  },
};

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-muted/30 px-4 py-12 relative overflow-hidden">
      <div className="absolute inset-0 bg-primary/5 pointer-events-none" />
      <div className="z-10 w-full max-w-md flex flex-col items-center gap-6">
        <img src={`${basePath}/tc-wordmark.png`} alt="Transform Church" className="h-10 w-auto" />
        {children}
      </div>
    </div>
  );
}

function SignInPage() {
  return (
    <AuthShell>
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </AuthShell>
  );
}

function SignUpPage() {
  return (
    <AuthShell>
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </AuthShell>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

// Context that tracks whether the first-login DB upsert has settled.
// Protected routes wait for this before rendering so they never query the API
// with a user that does not yet exist in our database.
const UserSyncContext = createContext<{ synced: boolean }>({ synced: false });

function UserSyncProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoaded, isSignedIn } = useUser();
  const { mutate: upsertMe } = useUpsertMe();
  const queryClient = useQueryClient();
  const syncedRef = useRef(false);
  // Treat "not signed in" as already synced — no upsert needed.
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setSynced(true);
      return;
    }
    if (syncedRef.current) return;
    syncedRef.current = true;

    upsertMe(
      {
        data: {
          firstName: user?.firstName || "",
          lastName: user?.lastName || "",
          email: user?.primaryEmailAddress?.emailAddress || "",
          phone: user?.primaryPhoneNumber?.phoneNumber || null,
        },
      },
      {
        onSuccess: () => {
          // Invalidate all cached queries so they re-fetch with the user now in DB
          queryClient.invalidateQueries();
          setSynced(true);
        },
        onError: () => {
          // Still allow the app to render — API calls will just 404 gracefully
          setSynced(true);
        },
      }
    );
  }, [isLoaded, isSignedIn, user, upsertMe, queryClient]);

  return (
    <UserSyncContext.Provider value={{ synced }}>
      {children}
    </UserSyncContext.Provider>
  );
}

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
}

function ProtectedRoute({ component: Component, adminOnly = false, managerOrAdmin = false }: { component: any, adminOnly?: boolean, managerOrAdmin?: boolean }) {
  const { isLoaded, isSignedIn } = useUser();
  const { synced } = useContext(UserSyncContext);
  const { data: me, isLoading: meLoading } = useGetMe();

  if (!isLoaded) return <Spinner />;
  if (!isSignedIn) return <Redirect to="/" />;
  if (!synced) return <Spinner />;

  // Wait for role to load if we need to check it
  if ((adminOnly || managerOrAdmin) && meLoading) return <Spinner />;

  if (adminOnly && me) {
    if (me.role === "manager") return <Redirect to="/admin/users" />;
    if (me.role === "student") return <Redirect to="/dashboard" />;
  }

  if (managerOrAdmin && me) {
    if (me.role === "student") return <Redirect to="/dashboard" />;
  }

  return (
    <AppLayout>
      <Component />
    </AppLayout>
  );
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <Home />
      </Show>
    </>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      localization={{
        signIn: { start: { subtitle: "Sign in to Transform Church Training Platform" } },
      }}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <UserSyncProvider>
        <Switch>
          <Route path="/" component={HomeRedirect} />
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          
          {/* Protected Routes */}
          <Route path="/dashboard"><ProtectedRoute component={Dashboard} /></Route>
          <Route path="/tracks"><ProtectedRoute component={Tracks} /></Route>
          <Route path="/tracks/:trackId"><ProtectedRoute component={TrackDetail} /></Route>
          <Route path="/modules/:moduleId"><ProtectedRoute component={ModuleDetail} /></Route>
          <Route path="/watch/:videoId"><ProtectedRoute component={WatchVideo} /></Route>
          <Route path="/queue"><ProtectedRoute component={Queue} /></Route>
          <Route path="/history"><ProtectedRoute component={History} /></Route>
          <Route path="/profile"><ProtectedRoute component={Profile} /></Route>
          <Route path="/groups"><ProtectedRoute component={Groups} /></Route>
          
          {/* Admin Routes */}
          <Route path="/admin"><ProtectedRoute component={AdminDashboard} adminOnly /></Route>
          <Route path="/admin/users"><ProtectedRoute component={AdminUsers} managerOrAdmin /></Route>
          <Route path="/admin/content"><ProtectedRoute component={AdminContent} managerOrAdmin /></Route>
          <Route path="/admin/growth-tracks"><ProtectedRoute component={AdminGrowthTracks} managerOrAdmin /></Route>
          <Route path="/admin/settings"><ProtectedRoute component={AdminSettings} adminOnly /></Route>
          
          <Route component={NotFound} />
        </Switch>
        </UserSyncProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <TooltipProvider>
      <WouterRouter base={basePath}>
        <ClerkProviderWithRoutes />
      </WouterRouter>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
