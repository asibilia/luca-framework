"use client";

import type { ComponentProps } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Activity,
  LayoutDashboard,
  GitBranch,
  RefreshCw,
  Shield,
  ListTodo,
  Brain,
  Scale,
  Bot,
  DollarSign,
  GitPullRequest,
  StickyNote,
  BookOpen,
  Database,
  Network,
  Search,
  AlertTriangle,
  Fingerprint,
  Hexagon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  Sidebar as SidebarRoot,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "~/components/ui/sidebar";
import { NAV_ITEMS } from "~/lib/constants";

const ICON_MAP: Record<string, LucideIcon> = {
  Activity,
  LayoutDashboard,
  GitBranch,
  RefreshCw,
  Shield,
  ListTodo,
  Brain,
  Scale,
  Bot,
  DollarSign,
  GitPullRequest,
  StickyNote,
  BookOpen,
  Database,
  Network,
  Search,
  AlertTriangle,
  Fingerprint,
};

/**
 * Sidebar navigation using shadcn Sidebar primitives.
 *
 * Uses `variant="inset"` for the rounded, padded layout matching
 * the shadcn dashboard-01 reference.
 */
export function Sidebar(props: ComponentProps<typeof SidebarRoot>) {
  const pathname = usePathname();

  return (
    <SidebarRoot collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:!p-1.5"
            >
              <Link href="/">
                <Hexagon className="!size-5" />
                <span className="text-base font-semibold">Luca Observer</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                const Icon = ICON_MAP[item.icon];

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={item.label}
                    >
                      <Link href={item.href}>
                        {Icon ? (
                          <Icon />
                        ) : (
                          <span className="font-mono text-xs">{item.icon}</span>
                        )}
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </SidebarRoot>
  );
}
