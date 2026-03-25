"use client";

import { useCallback, useMemo } from "react";

import { useAtom, useSetAtom } from "jotai";
import get from "lodash/get";

import { Input } from "~/components/ui/input";
import { Switch } from "~/components/ui/switch";
import { markDirtyAtom } from "~/stores/dirty-tracking";
import { configDraftAtom } from "~/stores/config-atoms";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape of a single harness check entry. */
type HarnessCheck = {
  name: string;
  command: string;
  enabled: boolean;
  timeout: number;
  parser: string;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Harness tab displaying check type toggles, command overrides, and
 * iteration limit inputs.
 *
 * Shows each check (test, typecheck, lint, build) as a row with enabled
 * Switch, command text input, and timeout numeric input. Also shows
 * global harness settings (enabled, maxFixIterations, failFast).
 *
 * Writes to `configDraftAtom` and marks the "config" dirty key on change.
 *
 * @example
 * ```tsx
 * <HarnessTab />
 * ```
 */
export function HarnessTab() {
  const [config, setConfig] = useAtom(configDraftAtom);
  const markDirty = useSetAtom(markDirtyAtom);

  const harness = useMemo(() => {
    return get(config, "harness", {}) as Record<string, unknown>;
  }, [config]);

  const checks = useMemo(() => {
    return get(harness, "checks", []) as HarnessCheck[];
  }, [harness]);

  const harnessEnabled = get(harness, "enabled", true) as boolean;
  const maxFixIterations = get(harness, "maxFixIterations", 3) as number;
  const failFast = get(harness, "failFast", false) as boolean;

  const updateHarnessField = useCallback(
    (field: string, value: unknown) => {
      const current = { ...(config ?? {}) };
      const currentHarness = {
        ...(get(current, "harness", {}) as Record<string, unknown>),
      };
      currentHarness[field] = value;
      current.harness = currentHarness;
      setConfig(current);
      markDirty("config");
    },
    [config, setConfig, markDirty],
  );

  const updateCheck = useCallback(
    (idx: number, field: keyof HarnessCheck, value: unknown) => {
      const current = { ...(config ?? {}) };
      const currentHarness = {
        ...(get(current, "harness", {}) as Record<string, unknown>),
      };
      const currentChecks = [
        ...(get(currentHarness, "checks", []) as HarnessCheck[]),
      ];
      currentChecks[idx] = { ...currentChecks[idx], [field]: value };
      currentHarness.checks = currentChecks;
      current.harness = currentHarness;
      setConfig(current);
      markDirty("config");
    },
    [config, setConfig, markDirty],
  );

  return (
    <div className="space-y-6">
      {/* Global harness settings */}
      <div className="space-y-3">
        <h4 className="text-xs font-medium text-muted-foreground">
          Global Settings
        </h4>
        <div className="flex items-center justify-between rounded-md border px-3 py-2">
          <div>
            <span className="text-sm font-medium">Harness Enabled</span>
            <p className="text-xs text-muted-foreground">
              Run verification harness at phase boundaries
            </p>
          </div>
          <Switch
            checked={harnessEnabled}
            onCheckedChange={(checked) =>
              updateHarnessField("enabled", checked)
            }
          />
        </div>
        <div className="flex items-center justify-between rounded-md border px-3 py-2">
          <div>
            <span className="text-sm font-medium">Fail Fast</span>
            <p className="text-xs text-muted-foreground">
              Stop on first check failure
            </p>
          </div>
          <Switch
            checked={failFast}
            onCheckedChange={(checked) =>
              updateHarnessField("failFast", checked)
            }
          />
        </div>
        <div className="flex items-center justify-between rounded-md border px-3 py-2">
          <div>
            <span className="text-sm font-medium">Max Fix Iterations</span>
            <p className="text-xs text-muted-foreground">
              Maximum auto-fix attempts before failing
            </p>
          </div>
          <Input
            type="number"
            min={1}
            max={10}
            value={maxFixIterations}
            onChange={(e) =>
              updateHarnessField("maxFixIterations", Number(e.target.value))
            }
            className="h-7 w-20 font-mono text-xs"
          />
        </div>
      </div>

      {/* Check configurations */}
      <div className="space-y-3">
        <h4 className="text-xs font-medium text-muted-foreground">
          Check Types
        </h4>
        {checks.map((check, idx) => (
          <div key={check.name} className="rounded-md border px-3 py-2.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm font-medium">
                {check.name}
              </span>
              <Switch
                checked={check.enabled}
                onCheckedChange={(checked) =>
                  updateCheck(idx, "enabled", checked)
                }
              />
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Command</label>
                <Input
                  value={check.command}
                  onChange={(e) => updateCheck(idx, "command", e.target.value)}
                  className="h-7 font-mono text-xs"
                  placeholder="Command..."
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  Timeout (s)
                </label>
                <Input
                  type="number"
                  min={1}
                  max={600}
                  value={check.timeout}
                  onChange={(e) =>
                    updateCheck(idx, "timeout", Number(e.target.value))
                  }
                  className="h-7 w-20 font-mono text-xs"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
