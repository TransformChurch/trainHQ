import { Link, useLocation } from "wouter";
import { useGetMe } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/App";
import { BookOpen, LayoutDashboard, Settings, Video, ShieldCheck, LogOut, Menu, UserCircle, Users, TrendingUp, UsersRound, FileText, Wrench, BarChart3, Library, MessageSquare, SlidersHorizontal, type LucideIcon } from "lucide-react";
import wordmark from "@assets/TC_Black_Wordmark_1782833324395.png";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useEffect, useState } from "react";
import { useSiteCopy } from "@/lib/siteCopy";
import { useToolAccess } from "@/lib/toolAccess";

type NavigationItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
};

export function Sidebar() {
  const [location] = useLocation();
  const { data: user } = useGetMe();
  const { signOut } = useAuth();
  const { copy } = useSiteCopy();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  const isAdmin = user?.role === "admin";
  const isManager = user?.role === "manager";
  const isManagerOrAdmin = isAdmin || isManager;
  const toolAccess = useToolAccess();
  const [facilitiesAllowed, setFacilitiesAllowed] = useState(false);
  const [wikiAllowed, setWikiAllowed] = useState(false);
  const [tcWikiAllowed, setTcWikiAllowed] = useState(false);

  const isProfileIncomplete = user && (!user.phone || !user.firstName || !user.lastName);

  useEffect(() => {
    if (!user) {
      setFacilitiesAllowed(false);
      setWikiAllowed(false);
      setTcWikiAllowed(false);
      return;
    }
    if (user.role === "admin") {
      setFacilitiesAllowed(true);
      setWikiAllowed(true);
      setTcWikiAllowed(true);
      return;
    }
    const token = sessionStorage.getItem("auth_bearer_token");
    const apiBase = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? basePath;
    fetch(`${apiBase}/api/facilities/access`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((response) => response.ok ? response.json() : { allowed: false })
      .then((result: { allowed?: boolean }) => setFacilitiesAllowed(result.allowed === true))
      .catch(() => setFacilitiesAllowed(false));
    fetch(`${apiBase}/api/wiki/access`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((response) => response.ok ? response.json() : { allowed: false })
      .then((result: { allowed?: boolean }) => setWikiAllowed(result.allowed === true))
      .catch(() => setWikiAllowed(false));
    fetch(`${apiBase}/api/tc-wiki/access`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((response) => response.ok ? response.json() : { allowed: false })
      .then((result: { allowed?: boolean }) => setTcWikiAllowed(result.allowed === true))
      .catch(() => setTcWikiAllowed(false));
  }, [user?.id, user?.role, basePath]);

  const learningItems: NavigationItem[] = [
    { href: "/dashboard", label: copy("nav.dashboard"), icon: LayoutDashboard },
    { href: "/tracks", label: copy("nav.trainingTracks"), icon: BookOpen },
    { href: "/queue", label: copy("nav.myQueue"), icon: Video },
    { href: "/groups", label: copy("nav.groups"), icon: UsersRound },
    { href: "/profile", label: copy("nav.myProfile"), icon: UserCircle, badge: isProfileIncomplete ? "!" : undefined },
  ];

  const toolsItems: NavigationItem[] = [
    { href: "/documents", label: copy("nav.documents"), icon: FileText },
    ...(wikiAllowed ? [{ href: "/wiki", label: copy("nav.wiki"), icon: Library }] : []),
    ...(tcWikiAllowed ? [{ href: "/tc-wiki", label: "TC Wiki", icon: Library }] : []),
    ...(facilitiesAllowed ? [{ href: "/facilities", label: copy("nav.requestHub"), icon: Wrench }] : []),
    ...(toolAccess.can("reporting") ? [{ href: "/reporting", label: "Reporting", icon: BarChart3 }] : []),
    ...(toolAccess.can("messaging") ? [{ href: "/messaging", label: "Messaging", icon: MessageSquare }] : []),
  ];

  const managerItems: NavigationItem[] = [
    { href: "/admin/users", label: copy("nav.usersProgress"), icon: Users },
    { href: "/admin/modules", label: copy("nav.moduleManager"), icon: BookOpen },
    { href: "/admin/documents", label: copy("nav.documentManager"), icon: FileText },
    { href: "/admin/growth-tracks", label: copy("nav.growthTracks"), icon: TrendingUp },
  ];

  const adminOnlyItems: NavigationItem[] = [
    { href: "/admin", label: copy("nav.adminDashboard"), icon: ShieldCheck },
    { href: "/admin/settings", label: copy("nav.adminSettings"), icon: Settings },
    { href: "/admin/tools", label: "Tool Management", icon: SlidersHorizontal },
    { href: "/admin/facilities", label: copy("nav.requestHub"), icon: Wrench },
    { href: "/admin/wiki", label: copy("nav.wiki"), icon: Library },
    { href: "/admin/tc-wiki", label: "TC Wiki", icon: Library },
  ];

  const handleSignOut = () => {
    signOut();
    window.location.assign(basePath || "/");
  };

  const NavContent = () => (
    <div className="flex flex-col h-full h-full py-4 bg-sidebar border-r border-sidebar-border w-64 text-sidebar-foreground">
      <div className="px-6 mb-8">
        <img src={wordmark} alt="Transform Church" className="w-full h-auto" />
      </div>

      <nav className="flex-1 overflow-y-auto px-4 space-y-1">
        {[
          { label: "Learning", items: learningItems },
          { label: "Tools", items: toolsItems },
          ...(isManagerOrAdmin
            ? [{ label: "Admin", items: [...(isAdmin ? adminOnlyItems : []), ...managerItems] }]
            : []),
        ].map((section) => (
          <div key={section.label} className={section.label === "Learning" ? "" : "mt-8"}>
            <div className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-2 px-2">
              {section.label}
            </div>
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.href || location.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-testid={`${section.label === "Admin" ? "nav-admin-" : "nav-"}${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <div
                    className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer ${
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${isActive ? "text-primary" : ""}`} />
                    <span className="flex-1">{item.label}</span>
                    {item.badge && (
                      <span className="text-[10px] font-bold bg-amber-400 text-amber-900 rounded-full w-4 h-4 flex items-center justify-center leading-none">
                        {item.badge}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        ))}

      </nav>

      <div className="px-4 mt-auto">
        <div className="pt-4 border-t border-sidebar-border">
          <div className="flex items-center justify-between px-2 mb-4">
            <div className="flex flex-col">
              <span className="text-sm font-medium text-sidebar-foreground truncate max-w-[140px]" data-testid="sidebar-user-name">
                {user ? `${user.firstName} ${user.lastName}` : 'Loading...'}
              </span>
              <span className="text-xs text-sidebar-foreground/60 truncate max-w-[140px]">
                {user?.email}
              </span>
            </div>
          </div>
          <Button variant="ghost" className="w-full justify-start text-sidebar-foreground/70 hover:text-destructive hover:bg-destructive/10" onClick={handleSignOut} data-testid="nav-logout">
             <LogOut className="w-4 h-4 mr-2" />
             {copy("nav.signOut")}
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="hidden md:block h-screen sticky top-0">
        <NavContent />
      </div>
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-background border-b border-border z-50 flex items-center px-4 justify-between">
        <div className="flex items-center gap-2 text-primary font-bold">
          <BookOpen className="w-5 h-5" />
          Transform
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-64">
            <NavContent />
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
