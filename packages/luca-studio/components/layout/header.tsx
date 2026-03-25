"use client";

import { useCallback, useEffect, useState } from "react";

import { useAtom } from "jotai";
import { Sun, Moon, Database, ChevronsUpDown, Check } from "lucide-react";

import { ContextWindowBar } from "~/components/layout/context-window-bar";
import { MemoryHealthIndicator } from "~/components/layout/memory-health-indicator";

import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "~/components/ui/dropdown-menu";
import { Separator } from "~/components/ui/separator";
import { SidebarTrigger } from "~/components/ui/sidebar";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "~/components/ui/tooltip";
import { themeAtom } from "~/stores/theme";
import { vaultAtom } from "~/stores/vault";

/**
 * Site header matching shadcn dashboard-01 layout.
 *
 * Uses `--header-height` CSS var, SidebarTrigger + Separator +
 * vault switcher dropdown + theme toggle.
 */
export function Header() {
  const [theme, setTheme] = useAtom(themeAtom);
  const [vault, setVault] = useAtom(vaultAtom);
  const [vaults, setVaults] = useState<string[]>([]);

  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");
  const oppositeTheme = theme === "dark" ? "light" : "dark";

  const fetchVaults = useCallback(async () => {
    try {
      const res = await fetch("/api/muninn/vaults");
      if (!res.ok) return;
      const data = (await res.json()) as string[];
      if (Array.isArray(data)) {
        setVaults(data);
        if (data.length > 0 && !data.includes(vault)) {
          setVault(data[0]!);
        }
      }
    } catch {
      // Silently fail — vaults list is best-effort
    }
  }, [vault, setVault]);

  useEffect(() => {
    void fetchVaults();
  }, [fetchVaults]);

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 h-4" />
        <div className="flex-1" />
        <ContextWindowBar />
        <Separator orientation="vertical" className="mx-1 h-4" />
        <MemoryHealthIndicator />
        <Separator orientation="vertical" className="mx-1 h-4" />
        {vaults.length > 1 && (
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-xs text-muted-foreground"
                  >
                    <Database className="size-3.5" />
                    <span>{vault}</span>
                    <ChevronsUpDown className="size-3 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <span className="text-xs">Switch MuninnDB vault</span>
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Switch vault</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup value={vault} onValueChange={setVault}>
                {vaults.map((v) => (
                  <DropdownMenuRadioItem key={v} value={v}>
                    <Database className="mr-2 size-4 text-muted-foreground" />
                    <span className="truncate">{v}</span>
                    {v === vault && (
                      <Check className="ml-auto size-4 text-primary" />
                    )}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
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
