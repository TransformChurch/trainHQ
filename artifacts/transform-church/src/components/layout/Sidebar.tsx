import { Link, useLocation } from "wouter";
import { useGetMe } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useClerk } from "@clerk/react";
import { BookOpen, LayoutDashboard, Settings, Video, ShieldCheck, LogOut, Menu, UserCircle, Users } from "lucide-react";
import wordmark from "@assets/TC_Black_Wordmark_1782833324395.png";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export function Sidebar() {
  const [location] = useLocation();
  const { data: user } = useGetMe();
  const { signOut } = useClerk();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  const isAdmin = user?.role === "admin";
  const isManager = user?.role === "manager";
  const isManagerOrAdmin = isAdmin || isManager;

  const isProfileIncomplete = user && (!user.phone || !user.firstName || !user.lastName);

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/tracks", label: "Training Tracks", icon: BookOpen },
    { href: "/queue", label: "My Queue", icon: Video },
    { href: "/profile", label: "My Profile", icon: UserCircle, badge: isProfileIncomplete ? "!" : undefined },
  ];

  const managerItems = [
    { href: "/admin/users", label: "Users & Progress", icon: Users },
    { href: "/admin/content", label: "Content Manager", icon: Settings },
  ];

  const adminOnlyItems = [
    { href: "/admin", label: "Admin Dashboard", icon: ShieldCheck },
    { href: "/admin/settings", label: "Admin Settings", icon: Settings },
  ];

  const handleSignOut = () => {
    signOut({ redirectUrl: basePath || "/" });
  };

  const NavContent = () => (
    <div className="flex flex-col h-full h-full py-4 bg-sidebar border-r border-sidebar-border w-64 text-sidebar-foreground">
      <div className="px-6 mb-8">
        <img src={wordmark} alt="Transform Church" className="w-full h-auto" />
      </div>

      <nav className="flex-1 px-4 space-y-1">
        <div className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-2 px-2">Learning</div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.href || location.startsWith(`${item.href}/`);
          return (
            <Link key={item.href} href={item.href} data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}>
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

        {isManagerOrAdmin && (
          <>
            <div className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mt-8 mb-2 px-2">
              {isAdmin ? "Administration" : "Management"}
            </div>

            {isAdmin && adminOnlyItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.href || location.startsWith(`${item.href}/`);
              return (
                <Link key={item.href} href={item.href} data-testid={`nav-admin-${item.label.toLowerCase().replace(/\s+/g, "-")}`}>
                  <div
                    className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer ${
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${isActive ? "text-primary" : ""}`} />
                    {item.label}
                  </div>
                </Link>
              );
            })}

            {managerItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.href || location.startsWith(`${item.href}/`);
              return (
                <Link key={item.href} href={item.href} data-testid={`nav-admin-${item.label.toLowerCase().replace(/\s+/g, "-")}`}>
                  <div
                    className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer ${
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${isActive ? "text-primary" : ""}`} />
                    {item.label}
                  </div>
                </Link>
              );
            })}
          </>
        )}
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
            Sign out
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
