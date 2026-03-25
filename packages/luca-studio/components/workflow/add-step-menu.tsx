"use client";

import { useCallback, useEffect, useRef } from "react";

import { Bot, Hexagon, Shield } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "~/lib/utils";

// -- Types --------------------------------------------------------------------

interface AddStepMenuProps {
  /** Callback when a step type is selected. */
  onSelect: (stepType: string) => void;
  /** Callback to close the menu. */
  onClose: () => void;
}

/** Step type option descriptor. */
interface StepTypeOption {
  type: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

// -- Constants ----------------------------------------------------------------

const STEP_TYPE_OPTIONS: StepTypeOption[] = [
  {
    type: "agent",
    label: "Agent Step",
    description: "Add a new agent workflow step",
    icon: Bot,
  },
  {
    type: "skill",
    label: "Skill Step",
    description: "Add a new skill workflow step",
    icon: Hexagon,
  },
  {
    type: "gate",
    label: "Gate Step",
    description: "Add a complexity gate step",
    icon: Shield,
  },
];

// -- Component ----------------------------------------------------------------

/**
 * Dropdown menu for selecting a step type when adding a new node.
 *
 * Rendered as a centered floating card over the canvas. Supports:
 * - Click to select a step type
 * - Escape to close
 * - Click outside to close
 *
 * @param onSelect - Called with the selected step type string (e.g., "agent")
 * @param onClose - Called when the menu should close
 */
export function AddStepMenu({ onSelect, onClose }: AddStepMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Use timeout to avoid closing on the same click that opened the menu
    const timer = setTimeout(() => {
      window.addEventListener("mousedown", handler);
    }, 100);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousedown", handler);
    };
  }, [onClose]);

  const handleSelect = useCallback(
    (type: string) => {
      onSelect(type);
    },
    [onSelect],
  );

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/20">
      <div
        ref={menuRef}
        className="w-64 rounded-lg border bg-card shadow-xl"
        role="menu"
        aria-label="Add step type"
      >
        <div className="border-b px-3 py-2">
          <p className="text-sm font-medium">Add Step</p>
          <p className="text-[10px] text-muted-foreground">
            Choose a step type to add to the pipeline
          </p>
        </div>
        <div className="p-1">
          {STEP_TYPE_OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.type}
                role="menuitem"
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors",
                  "hover:bg-muted/50 focus:bg-muted/50 focus:outline-none",
                )}
                onClick={() => handleSelect(option.type)}
              >
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{option.label}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {option.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
