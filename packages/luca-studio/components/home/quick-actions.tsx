"use client";

import Link from "next/link";
import { Bot, Hexagon, Shield, SlidersHorizontal } from "lucide-react";

import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type QuickActionItem = {
  href: string;
  label: string;
  description: string;
  icon: ReactNode;
};

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const ACTIONS: QuickActionItem[] = [
  {
    href: "/agents",
    label: "Agents",
    description: "Browse and edit agent configurations",
    icon: <Bot className="size-5" />,
  },
  {
    href: "/skills",
    label: "Skills",
    description: "View skill definitions and triggers",
    icon: <Hexagon className="size-5" />,
  },
  {
    href: "/rules",
    label: "Rules",
    description: "Manage rule profiles and globs",
    icon: <Shield className="size-5" />,
  },
  {
    href: "/config",
    label: "Config",
    description: "Edit project configuration",
    icon: <SlidersHorizontal className="size-5" />,
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Grid of navigation cards linking to key Studio pages.
 *
 * Provides quick access from the Home page to Agents, Skills, Rules,
 * and Config editors.
 *
 * @example
 * ```tsx
 * <QuickActions />
 * ```
 */
export function QuickActions() {
  return (
    <div>
      <h3 className="mb-3 text-sm font-medium text-muted-foreground">
        Quick Actions
      </h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ACTIONS.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="flex items-start gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <div className="mt-0.5 shrink-0 text-muted-foreground">
              {action.icon}
            </div>
            <div>
              <p className="text-sm font-medium">{action.label}</p>
              <p className="text-xs text-muted-foreground">
                {action.description}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
