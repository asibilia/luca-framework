"use client";

import { useCallback, useState } from "react";

import { useAtom } from "jotai";
import { ChevronDown } from "lucide-react";

import { Label } from "~/components/ui/label";
import { Switch } from "~/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible";
import { configDraftAtom } from "~/stores/config-atoms";
import { markDirtyAtom } from "~/stores/dirty-tracking";
import { cn } from "~/lib/utils";
import get from "lodash/get";

// -- Types --------------------------------------------------------------------

interface StepGatesSectionProps {
  /** React Flow node ID (used for element IDs). */
  nodeId: string;
}

/** Gate field descriptor. */
interface GateField {
  key: string;
  label: string;
  description: string;
}

// -- Constants ----------------------------------------------------------------

const GATE_FIELDS: GateField[] = [
  {
    key: "confirm_project",
    label: "Confirm Project",
    description: "Require project confirmation before execution",
  },
  {
    key: "confirm_phases",
    label: "Confirm Phases",
    description: "Require phase plan confirmation",
  },
  {
    key: "confirm_plan",
    label: "Confirm Plan",
    description: "Require individual plan confirmation",
  },
  {
    key: "premortem",
    label: "Premortem",
    description: "Run premortem analysis before execution",
  },
  {
    key: "process_data",
    label: "Process Data",
    description: "Collect process telemetry data",
  },
  {
    key: "execute_next_plan",
    label: "Execute Next Plan",
    description: "Auto-execute next plan in wave",
  },
];

// -- Component ----------------------------------------------------------------

/**
 * Gates section of the step configuration panel.
 *
 * Provides toggle switches for applicable workflow gates:
 * - confirm_project, confirm_phases, confirm_plan
 * - premortem, process_data, execute_next_plan
 *
 * Reads from / writes to `configDraftAtom` under the `gates` path.
 * Changes mark config as dirty.
 */
export function StepGatesSection({ nodeId }: StepGatesSectionProps) {
  const [open, setOpen] = useState(false);
  const [configDraft, setConfigDraft] = useAtom(configDraftAtom);
  const [, markDirty] = useAtom(markDirtyAtom);

  const getGateValue = useCallback(
    (gateKey: string): boolean => {
      const value = get(configDraft, `gates.${gateKey}`, true);
      return typeof value === "boolean" ? value : true;
    },
    [configDraft],
  );

  const updateGate = useCallback(
    (gateKey: string, checked: boolean) => {
      if (!configDraft) return;

      const draft = JSON.parse(JSON.stringify(configDraft)) as Record<
        string,
        unknown
      >;

      if (!draft.gates) draft.gates = {};
      const gates = draft.gates as Record<string, unknown>;
      gates[gateKey] = checked;

      setConfigDraft(draft);
      markDirty("config");
    },
    [configDraft, setConfigDraft, markDirty],
  );

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-2 py-2 text-sm font-medium hover:bg-muted/50">
        <span>Gates</span>
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 px-2 pb-3">
        {GATE_FIELDS.map((gate) => {
          const checked = getGateValue(gate.key);
          return (
            <div
              key={gate.key}
              className="flex items-center justify-between gap-3 rounded-md px-1 py-1"
            >
              <div className="flex-1 space-y-0.5">
                <Label
                  htmlFor={`gate-${nodeId}-${gate.key}`}
                  className="text-xs font-medium cursor-pointer"
                >
                  {gate.label}
                </Label>
                <p className="text-[10px] text-muted-foreground">
                  {gate.description}
                </p>
              </div>
              <Switch
                id={`gate-${nodeId}-${gate.key}`}
                checked={checked}
                onCheckedChange={(value) => updateGate(gate.key, value)}
              />
            </div>
          );
        })}
      </CollapsibleContent>
    </Collapsible>
  );
}
