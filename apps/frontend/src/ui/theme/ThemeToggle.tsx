import { useTheme } from "next-themes";

import { Button } from "@/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/ui/dropdown-menu";
import { Icon } from "@/ui/icon";
import { Desktop, Moon, Sun } from "@phosphor-icons/react";

interface ThemeToggleProps {
  className?: string;
}

const ThemeToggle = ({ className }: ThemeToggleProps) => {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={className}>
          <span className="sr-only">Change theme</span>
          {/* Render both and let CSS handle visibility for instant, no-layout-shift switch */}
          <span className="dark:hidden">
            <Icon icon={Sun} size="sm" />
          </span>
          <span className="hidden dark:inline">
            <Icon icon={Moon} size="sm" />
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")} aria-selected={theme === "light"}>
          <Icon icon={Sun} size="sm" />
          Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")} aria-selected={theme === "dark"}>
          <Icon icon={Moon} size="sm" />
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")} aria-selected={theme === "system"}>
          <Icon icon={Desktop} size="sm" />
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ThemeToggle;


