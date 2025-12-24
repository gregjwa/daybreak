import { useState, useEffect } from "react";
import { Outlet, Link, useNavigate } from "react-router-dom";
import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
  useAuth,
} from "@clerk/clerk-react";
import { useQueryClient } from "@tanstack/react-query";
import { fetchOrganizations } from "@/api/useOrganizations";
import { Sheet, SheetContent, SheetTrigger } from "@/ui/sheet";
import { Button } from "@/ui/button";
import { Buildings, CalendarBlank, House, Inbox, Kanban, List, UsersThree } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useGmailWatch } from "@/hooks/useGmailWatch";
import ThemeToggle from "@/ui/theme/ThemeToggle";
import { Toaster } from "@/ui/sonner";

const NavLink = ({
  to,
  children,
  icon: Icon,
  onMouseEnter,
}: {
  to: string;
  children: React.ReactNode;
  icon: React.ComponentType<any>;
  onMouseEnter?: () => void;
}) => {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
      onMouseEnter={onMouseEnter}
    >
      <Icon className="h-4 w-4" />
      {children}
    </Link>
  );
};

const Sidebar = ({ className }: { className?: string }) => {
  const queryClient = useQueryClient();

  const prefetchOrgs = () => {
    queryClient.prefetchQuery({
      queryKey: ["organizations"],
      queryFn: fetchOrganizations,
    });
  };

  return (
    <div className={cn("flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground", className)}>
      <div className="flex h-14 items-center border-b border-sidebar-border px-6">
        <Link to="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <CalendarBlank className="h-5 w-5" weight="bold" />
          Daybreak
        </Link>
      </div>
      <div className="flex-1 space-y-1 px-3 py-4">
        <NavLink to="/" icon={House}>
          Dashboard
        </NavLink>
        <NavLink to="/inbox" icon={Inbox}>
          Inbox
        </NavLink>
        <NavLink to="/projects" icon={Kanban}>
          Projects
        </NavLink>
        <NavLink to="/suppliers" icon={Buildings}>
          Suppliers
        </NavLink>
        <NavLink to="/organizations" icon={UsersThree} onMouseEnter={prefetchOrgs}>
          Organizations
        </NavLink>
      </div>
    </div>
  );
};

const RootLayout = () => {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const { isSignedIn } = useAuth();
  const navigate = useNavigate();

  // Auto-enable Gmail watch for signed-in users with Google connected.
  // This ensures the webhook can map emailAddress -> user via GmailWatch row.
  useGmailWatch();

  // Check for pending invite after redirect from auth
  useEffect(() => {
    if (isSignedIn) {
      const pendingToken = sessionStorage.getItem("pendingInviteToken");
      if (pendingToken) {
        sessionStorage.removeItem("pendingInviteToken");
        navigate(`/invite/${pendingToken}`);
      }
    }
  }, [isSignedIn, navigate]);

  return (
    <div className="grid min-h-screen w-full md:grid-cols-[240px_1fr] lg:grid-cols-[280px_1fr]">
      <div className="hidden border-r bg-muted/40 md:block">
        <Sidebar />
      </div>
      <div className="flex flex-col">
        <header className="flex h-14 items-center gap-4 border-b bg-background/70 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="shrink-0 md:hidden"
              >
                <List className="h-5 w-5" weight="bold" />
                <span className="sr-only">Toggle navigation menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex flex-col p-0 w-64">
              <Sidebar className="border-none" />
            </SheetContent>
          </Sheet>
          <div className="w-full flex-1">
            {/* Placeholder for search or breadcrumbs */}
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <SignedOut>
              <div className="flex gap-2">
                <SignInButton mode="modal">
                  <Button variant="ghost" size="sm">
                    Sign In
                  </Button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <Button size="sm">Sign Up</Button>
                </SignUpButton>
              </div>
            </SignedOut>
            <SignedIn>
              <UserButton />
            </SignedIn>
          </div>
        </header>
        <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6">
          <Outlet />
        </main>
      </div>
      <Toaster />
    </div>
  );
};

export default RootLayout;
