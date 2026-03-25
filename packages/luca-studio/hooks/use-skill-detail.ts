"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useSetAtom } from "jotai";
import { RESET } from "jotai-history";

import { skillDraftAtom, skillHistoryAtom } from "~/stores/entity-atoms";

import type { EntityDetail } from "~/lib/entity-route-helpers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UseSkillDetailReturn = {
  /** Full skill detail from the API, or null if not yet loaded. */
  detail: EntityDetail | null;
  /** Whether the detail is currently loading. */
  loading: boolean;
  /** Error message if the fetch failed. */
  error: string | null;
  /** The ETag from the last successful GET (used for optimistic concurrency). */
  etag: string | null;
  /** Manually refetch the skill detail. */
  refresh: () => void;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Fetches a single skill's full config from `/api/entities/skills/[name]` and
 * populates the corresponding `skillDraftAtom(name)`.
 *
 * When `name` is `null`, no fetch occurs and the hook returns idle state.
 * Uses a nameRef guard to prevent stale fetch updates.
 *
 * @param name - Kebab-case skill name, or null to skip fetching.
 * @returns Skill detail data, status indicators, and the ETag for concurrency.
 *
 * @example
 * ```ts
 * const { detail, loading, error, etag, refresh } = useSkillDetail("git-commit");
 * ```
 */
export function useSkillDetail(name: string | null): UseSkillDetailReturn {
  const [detail, setDetail] = useState<EntityDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [etag, setEtag] = useState<string | null>(null);
  const setDraft = useSetAtom(skillDraftAtom(name ?? "__noop__"));
  const resetHistory = useSetAtom(skillHistoryAtom(name ?? "__noop__"));

  // Track which name we last fetched to avoid stale updates
  const nameRef = useRef(name);
  nameRef.current = name;

  const fetchDetail = useCallback(async () => {
    if (!name) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/entities/skills/${encodeURIComponent(name)}`,
      );
      if (!res.ok) {
        throw new Error(`Failed to fetch skill: ${res.status}`);
      }
      const json = (await res.json()) as { data: EntityDetail };
      const etagHeader = res.headers.get("ETag");

      // Only apply if we haven't switched skills mid-flight
      if (nameRef.current === name) {
        setDetail(json.data);
        setEtag(etagHeader);
        // Populate the draft atom with raw config + metadata for the form
        setDraft({
          ...json.data.metadata,
          rawConfigText: json.data.rawConfigText,
          name: json.data.name,
          domain: json.data.domain,
        } as Record<string, unknown>);
        // Reset undo history so users cannot undo back to the empty state
        resetHistory(RESET);
      }
    } catch (err) {
      if (nameRef.current === name) {
        const message =
          err instanceof Error ? err.message : "Failed to load skill detail";
        setError(message);
      }
    } finally {
      if (nameRef.current === name) {
        setLoading(false);
      }
    }
  }, [name, setDraft, resetHistory]);

  useEffect(() => {
    if (name) {
      setDetail(null);
      setEtag(null);
      void fetchDetail();
    } else {
      setDetail(null);
      setEtag(null);
      setLoading(false);
      setError(null);
    }
  }, [name, fetchDetail]);

  return { detail, loading, error, etag, refresh: fetchDetail };
}
