"use client";

import { useCallback } from "react";

import { useAtom, useSetAtom } from "jotai";

import { markCleanAtom } from "~/stores/dirty-tracking";
import { ruleDraftAtom } from "~/stores/entity-atoms";

import { mergeFieldOverrides } from "~/hooks/helpers/merge-field-overrides";

import type { FieldKeyMap } from "~/hooks/helpers/merge-field-overrides";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UseRuleSaveReturn = {
  /** Persist the current draft to the server via PUT. */
  save: () => Promise<void>;
  /** Discard draft changes and revert to server state. */
  discard: () => void;
};

// ---------------------------------------------------------------------------
// Rule-specific field key map
// ---------------------------------------------------------------------------

/**
 * Rule field-to-config-key mapping.
 *
 * Rules have description and alwaysApply as their primary editable string
 * fields. The `alwaysApply` field is unique to rules (boolean, but stored
 * as a config key rather than the universal `enabled` field).
 */
const RULE_FIELD_KEY_MAP: FieldKeyMap = {
  description: ["description"],
  alwaysApply: ["alwaysApply"],
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Save and discard logic for a single rule, including ETag concurrency.
 *
 * Uses the shared `mergeFieldOverrides` helper with `RULE_FIELD_KEY_MAP`
 * to serialize form-field overrides back into rawConfigText. The
 * `alwaysApply` field (unique to rules) is included in the field map.
 *
 * @param name - Kebab-case rule name, or null to return no-ops.
 * @param etag - ETag from the last successful GET, used for If-Match.
 * @returns Object with save and discard callbacks.
 *
 * @example
 * ```ts
 * const { save, discard } = useRuleSave("no-classes", etag);
 * ```
 */
export function useRuleSave(
  name: string | null,
  etag: string | null,
): UseRuleSaveReturn {
  const [draft, setDraft] = useAtom(ruleDraftAtom(name ?? "__noop__"));
  const markClean = useSetAtom(markCleanAtom);

  const save = useCallback(async () => {
    if (!name) return;

    const entityKey = `rule:${name}`;

    // Build the PUT payload from the draft, merging form-field overrides
    const rawConfigText = mergeFieldOverrides(draft, RULE_FIELD_KEY_MAP);
    const metadata = {
      varName: (draft.varName as string) ?? "",
      domain: (draft.domain as string) ?? "rules",
      imports: (draft.imports as string[]) ?? [],
      sharedConstants: (draft.sharedConstants as string[]) ?? [],
      exportVarName: (draft.exportVarName as string) ?? "",
      factoryFn: (draft.factoryFn as string) ?? "",
      configType: (draft.configType as string) ?? "",
      prefix: (draft.prefix as string) ?? "",
      suffix: (draft.suffix as string) ?? "",
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (etag) {
      headers["If-Match"] = etag;
    }

    const res = await fetch(`/api/entities/rules/${encodeURIComponent(name)}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ rawConfigText, metadata }),
    });

    if (res.status === 409) {
      throw new Error(
        "Conflict: the rule has been modified externally. Please refresh and try again.",
      );
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(
        (body as { error?: string }).error ??
          `Save failed with status ${res.status}`,
      );
    }

    markClean(entityKey);
  }, [name, draft, etag, markClean]);

  const discard = useCallback(() => {
    if (!name) return;
    setDraft({});
    markClean(`rule:${name}`);
  }, [name, setDraft, markClean]);

  return { save, discard };
}
