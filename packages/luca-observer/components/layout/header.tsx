"use client";

import { useAtom } from "jotai";
import { Sun, Moon } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import { SidebarTrigger } from "~/components/ui/sidebar";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "~/components/ui/tooltip";
import { themeAtom } from "~/stores/theme";

/**
 * Site header matching shadcn dashboard-01 layout.
 *
 * Uses `--header-height` CSS var, SidebarTrigger + Separator + theme toggle.
 */
export function Header() {
  const [theme, setTheme] = useAtom(themeAtom);

  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");
  const oppositeTheme = theme === "dark" ? "light" : "dark";

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 h-4" />
        <div className="flex-1" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label={`Switch to ${oppositeTheme} mode`}
              aria-pressed={theme === "dark"}
              className="text-muted-foreground"
            >
              {theme === "dark" ? <Sun /> : <Moon />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <span className="text-xs">Switch to {oppositeTheme} mode</span>
          </TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
