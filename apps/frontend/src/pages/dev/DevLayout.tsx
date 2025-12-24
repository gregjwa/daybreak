import { NavLink, Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  Flask,
  EnvelopeSimple,
  ArrowsClockwise,
  Database,
  Terminal,
} from "@phosphor-icons/react";

const devNavItems = [
  {
    name: "Experiments",
    path: "/dev/experiments",
    icon: Flask,
    description: "A/B testing for AI enrichment",
  },
  {
    name: "Email Matching",
    path: "/dev/email-matching",
    icon: EnvelopeSimple,
    description: "Test incoming email → supplier matching",
  },
  {
    name: "Status Updates",
    path: "/dev/status-updates",
    icon: ArrowsClockwise,
    description: "Test automated status transitions",
  },
  {
    name: "Data Inspector",
    path: "/dev/data",
    icon: Database,
    description: "View raw database records",
  },
];

export default function DevLayout() {
  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-surface-canvas flex flex-col">
        <header className="px-4 py-4 border-b">
          <div className="flex items-center gap-2">
            <Terminal className="h-5 w-5 text-amber-500" weight="bold" />
            <h1 className="font-display text-lg font-semibold">Dev Tools</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Test and debug system flows
          </p>
        </header>

        <nav className="flex-1 p-2 space-y-1">
          {devNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                cn(
                  "flex items-start gap-3 px-3 py-2.5 rounded-lg transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-muted text-muted-foreground hover:text-foreground"
                )
              }
            >
              <item.icon className="h-5 w-5 mt-0.5 shrink-0" weight="duotone" />
              <div className="min-w-0">
                <div className="text-sm font-medium">{item.name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {item.description}
                </div>
              </div>
            </NavLink>
          ))}
        </nav>

        <footer className="p-4 border-t text-xs text-muted-foreground">
          <p>⚠️ Dev tools - not for production use</p>
        </footer>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}

