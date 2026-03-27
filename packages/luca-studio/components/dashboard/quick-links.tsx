"use client";

import {
  Brain,
  BookOpen,
  Database,
  Network,
  Search,
  Activity,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "~/components/ui/card";

/**
 * Quick link configuration for the dashboard navigation grid.
 */
const QUICK_LINKS: Array<{
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  colorVar: string;
}> = [
  {
    href: "/memory",
    label: "Memory",
    description: "Brain tree & engrams",
    icon: Brain,
    colorVar: "var(--color-event-memory)",
  },
  {
    href: "/memory?tab=learning",
    label: "Learning",
    description: "Patterns & decisions",
    icon: BookOpen,
    colorVar: "var(--color-info)",
  },
  {
    href: "/memory?tab=health",
    label: "Vault Health",
    description: "Coherence metrics",
    icon: Database,
    colorVar: "var(--color-warning)",
  },
  {
    href: "/memory?tab=graph",
    label: "Knowledge Graph",
    description: "Entity relationships",
    icon: Network,
    colorVar: "var(--color-success)",
  },
  {
    href: "/memory?tab=search",
    label: "Search",
    description: "Query knowledge base",
    icon: Search,
    colorVar: "var(--color-chart-2)",
  },
  {
    href: "/sessions",
    label: "Sessions",
    description: "Workflow history",
    icon: Activity,
    colorVar: "var(--color-event-session)",
  },
];

/**
 * Quick navigation links grid for the dashboard.
 *
 * Renders a compact grid of cards linking to all major Observer pages,
 * with icons and short descriptions.
 */
export function QuickLinks() {
  return (
    <div className="grid gap-2 lg:grid-cols-3">
      {QUICK_LINKS.map((link) => {
        const Icon = link.icon;
        return (
          <a key={link.href} href={link.href} className="group">
            <Card
              size="sm"
              className="transition-colors group-hover:ring-primary/30"
            >
              <CardContent className="flex items-center gap-2.5">
                <Icon
                  className="h-4 w-4 shrink-0 opacity-60"
                  style={{ color: link.colorVar }}
                />
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs font-medium text-foreground">
                    {link.label}
                  </p>
                  <p className="truncate font-mono text-[10px] text-muted-foreground">
                    {link.description}
                  </p>
                </div>
              </CardContent>
            </Card>
          </a>
        );
      })}
    </div>
  );
}
