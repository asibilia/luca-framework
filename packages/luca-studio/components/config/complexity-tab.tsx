"use client";

import { useCallback, useMemo } from "react";

import { useAtom, useSetAtom } from "jotai";
import get from "lodash/get";

import { Input } from "~/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { COMPLEXITY_LEVELS } from "~/lib/constants";
import { markDirtyAtom } from "~/stores/dirty-tracking";
import { configDraftAtom } from "~/stores/config-atoms";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Loop budget fields for a single complexity level. */
type LevelBudget = {
  cognitivePreflight: string;
  planVerificationIterations: number;
  harnessFixIterations: number;
  verifyFixIterations: number;
  verificationMode: string;
  recallDepth: number | null;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Complexity tab displaying the model routing matrix and loop budgets.
 *
 * Shows each complexity level as a row with its loop budget parameters
 * as editable inputs. Writes to `configDraftAtom` and marks the "config"
 * dirty key on every change.
 *
 * @example
 * ```tsx
 * <ComplexityTab />
 * ```
 */
export function ComplexityTab() {
  const [config, setConfig] = useAtom(configDraftAtom);
  const markDirty = useSetAtom(markDirtyAtom);

  const complexitySection = useMemo(() => {
    return get(config, "complexity", {}) as Record<string, unknown>;
  }, [config]);

  const matrix = useMemo(() => {
    return get(complexitySection, "matrix", {}) as Record<string, LevelBudget>;
  }, [complexitySection]);

  const defaultLevel = useMemo(() => {
    return get(complexitySection, "defaultLevel", "auto") as string;
  }, [complexitySection]);

  const updateBudgetField = useCallback(
    (level: string, field: keyof LevelBudget, value: unknown) => {
      const current = { ...(config ?? {}) };
      const currentComplexity = {
        ...(get(current, "complexity", {}) as Record<string, unknown>),
      };
      const currentMatrix = {
        ...(get(currentComplexity, "matrix", {}) as Record<
          string,
          LevelBudget
        >),
      };
      const currentLevel = {
        ...(get(currentMatrix, level, {}) as LevelBudget),
      };
      currentLevel[field] = value as never;
      currentMatrix[level] = currentLevel;
      currentComplexity.matrix = currentMatrix;
      current.complexity = currentComplexity;
      setConfig(current);
      markDirty("config");
    },
    [config, setConfig, markDirty],
  );

  const levels = Object.keys(COMPLEXITY_LEVELS) as Array<
    keyof typeof COMPLEXITY_LEVELS
  >;

  return (
    <div className="space-y-6">
      {/* Default level */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">
          Default Level
        </label>
        <p className="font-mono text-sm">{defaultLevel}</p>
      </div>

      {/* Loop budget matrix */}
      <div>
        <Tooltip>
          <TooltipTrigger asChild>
            <h4 className="mb-2 inline-flex cursor-help text-xs font-medium text-muted-foreground underline decoration-dotted decoration-muted-foreground/40 underline-offset-2">
              Loop Budget Matrix
            </h4>
          </TooltipTrigger>
          <TooltipContent>
            Controls how many retry iterations each verification step gets at
            each complexity level. Higher budgets allow more fix attempts before
            failing.
          </TooltipContent>
        </Tooltip>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="px-2 py-1.5 text-left font-medium">Level</th>
                <th className="px-2 py-1.5 text-left font-medium">Cognitive</th>
                <th className="px-2 py-1.5 text-left font-medium">
                  Plan Verify
                </th>
                <th className="px-2 py-1.5 text-left font-medium">
                  Harness Fix
                </th>
                <th className="px-2 py-1.5 text-left font-medium">
                  Verify Fix
                </th>
                <th className="px-2 py-1.5 text-left font-medium">
                  Verification
                </th>
                <th className="px-2 py-1.5 text-left font-medium">
                  Recall Depth
                </th>
              </tr>
            </thead>
            <tbody>
              {levels.map((level) => {
                const budget = get(matrix, level, {}) as Partial<LevelBudget>;
                const meta = COMPLEXITY_LEVELS[level];

                return (
                  <tr key={level} className="border-b last:border-b-0">
                    <td className="px-2 py-1.5 font-mono text-xs font-medium">
                      {meta.label}
                    </td>
                    <td className="px-2 py-1.5">
                      <span className="font-mono text-xs">
                        {budget.cognitivePreflight ?? "--"}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        type="number"
                        min={1}
                        max={10}
                        value={budget.planVerificationIterations ?? 1}
                        onChange={(e) =>
                          updateBudgetField(
                            level,
                            "planVerificationIterations",
                            Number(e.target.value),
                          )
                        }
                        className="h-7 w-16 font-mono text-xs"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        type="number"
                        min={1}
                        max={10}
                        value={budget.harnessFixIterations ?? 1}
                        onChange={(e) =>
                          updateBudgetField(
                            level,
                            "harnessFixIterations",
                            Number(e.target.value),
                          )
                        }
                        className="h-7 w-16 font-mono text-xs"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        type="number"
                        min={1}
                        max={10}
                        value={budget.verifyFixIterations ?? 1}
                        onChange={(e) =>
                          updateBudgetField(
                            level,
                            "verifyFixIterations",
                            Number(e.target.value),
                          )
                        }
                        className="h-7 w-16 font-mono text-xs"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <span className="font-mono text-xs">
                        {budget.verificationMode ?? "--"}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      <span className="font-mono text-xs">
                        {budget.recallDepth ?? "null"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
