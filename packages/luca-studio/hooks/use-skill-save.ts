"use client";

import { useCallback } from "react";

import { useAtom, useSetAtom } from "jotai";

import { markCleanAtom } from "~/stores/dirty-tracking";
import { skillDraftAtom } from "~/stores/entity-atoms";

import { mergeFieldOverrides } from "~/hooks/helpers/merge-field-overrides";

import type { FieldKeyMap } from "~/hooks/helpers/merge-field-overrides";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UseSkillSaveReturn = {
  /** Persist the current draft to the server via PUT. */
  save: () => Promise<void>;
  /** Discard draft changes and revert to server state. */
  discard: () => void;
};

// ---------------------------------------------------------------------------
// Skill-specific field key map
// ---------------------------------------------------------------------------

/**
 * Skill field-to-config-key mapping.
 *
 * Skills have a simpler config shape than agents: description and enabled
 * are the primary editable fields.
 */
const SKILL_FIELD_KEY_MAP: FieldKeyMap = {
  description: ["description"],
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Save and discard logic for a single skill, including ETag concurrency.
 *
 * Uses the shared `mergeFieldOverrides` helper with `SKILL_FIELD_KEY_MAP`
 * to serialize form-field overrides back into rawConfigText.
 *
 * @param name - Kebab-case skill name, or null to return no-ops.
 * @param etag - ETag from the last successful GET, used for If-Match.
 * @returns Object with save and discard callbacks.
 *
 * @example
 * ```ts
 * const { save, discard } = useSkillSave("git-commit", etag);
 * ```
 */
export function useSkillSave(
  name: string | null,
  etag: string | null,
): UseSkillSaveReturn {
  const [draft, setDraft] = useAtom(skillDraftAtom(name ?? "__noop__"));
  const markClean = useSetAtom(markCleanAtom);

  const save = useCallback(async () => {
    if (!name) return;

    const entityKey = `skill:${name}`;

    // Build the PUT payload from the draft, merging form-field overrides
    const rawConfigText = mergeFieldOverrides(draft, SKILL_FIELD_KEY_MAP);
    const metadata = {
      varName: (draft.varName as string) ?? "",
      domain: (draft.domain as string) ?? "skills",
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

    const res = await fetch(
      `/api/entities/skills/${encodeURIComponent(name)}`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify({ rawConfigText, metadata }),
      },
    );

    if (res.status === 409) {
      throw new Error(
        "Conflict: the skill has been modified externally. Please refresh and try again.",
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
    markClean(`skill:${name}`);
  }, [name, setDraft, markClean]);

  return { save, discard };
}
