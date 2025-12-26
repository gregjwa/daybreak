/**
 * Testing Layout
 * 
 * Shared layout for all testing pages with navigation tabs.
 */

import { Outlet, NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { 
  Users, 
  EnvelopeSimple, 
  Terminal, 
  Play, 
  ChartLine 
} from "@phosphor-icons/react";

const navItems = [
  { to: "/dev/testing", label: "Overview", icon: ChartLine, end: true },
  { to: "/dev/testing/personas", label: "Personas", icon: Users },
  { to: "/dev/testing/email-sets", label: "Email Sets", icon: EnvelopeSimple },
  { to: "/dev/testing/prompts", label: "Prompts", icon: Terminal },
  { to: "/dev/testing/run", label: "Run Test", icon: Play },
  { to: "/dev/testing/runs", label: "Results", icon: ChartLine },
];

export default function TestingLayout() {
  return (
    <div className="flex flex-col h-full">
      {/* Tab Navigation */}
      <div className="border-b bg-background">
        <nav className="flex gap-1 px-4 py-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}


