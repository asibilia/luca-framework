"use client";

import { useCallback } from "react";

import { useAtom } from "jotai";

import { conflictAtom } from "~/stores/config-atoms";

import type { ConflictState } from "~/stores/config-atoms";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UseEntityConflictReturn = {
  /** The active conflict for this entity, or null if no conflict exists. */
  entityConflict: NonNullable<ConflictState> | null;
  /** Accept local changes by re-saving with the server's current ETag. */
  handleAcceptLocal: () => Promise<void>;
  /** Accept server changes by discarding local draft and clearing conflict. */
  handleAcceptServer: () => void;
  /** Dismiss the conflict dialog without resolving. */
  handleDismissConflict: () => void;
};

type UseEntityConflictConfig = {
  /** Entity key in `{type}:{name}` format (e.g. "agent:lu-router"). */
  entityKey: string;
  /** API endpoint for the entity type (e.g. "/api/entities/agents"). */
  endpoint: string;
  /** Entity name for the URL path segment. */
  name: string | null;
  /** Metadata to include in the force-overwrite PUT body. */
  metadata: Record<string, unknown>;
  /** Callback to discard local draft changes (called on accept-server). */
  discard: () => void;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Shared conflict resolution logic for entity pages (agents, skills, rules).
 *
 * Extracts the duplicated handleAcceptLocal/handleAcceptServer/handleDismissConflict
 * pattern into a single reusable hook. Each entity page passes its specific config
 * (endpoint, metadata, discard callback) and gets back unified conflict handlers.
 *
 * @param config - Entity-specific configuration for conflict resolution.
 * @returns Object with entityConflict state and resolution handlers.
 *
 * @example
 * ```tsx
 * const { entityConflict, handleAcceptLocal, handleAcceptServer, handleDismissConflict } =
 *   useEntityConflict({
 *     entityKey: `agent:${selectedName}`,
 *     endpoint: "/api/entities/agents",
 *     name: selectedName,
 *     metadata: detail?.metadata ?? {},
 *     discard,
 *   });
 * ```
 */
export function useEntityConflict(
  config: UseEntityConflictConfig,
): UseEntityConflictReturn {
  const [conflict, setConflict] = useAtom(conflictAtom);

  const { entityKey, endpoint, name, metadata, discard } = config;

  // Derive whether the current conflict matches this entity
  const entityConflict =
    conflict && conflict.entityKey === entityKey ? conflict : null;

  const handleAcceptLocal = useCallback(async () => {
    if (!entityConflict) return;
    // Re-save with the server's current ETag to force overwrite
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "If-Match": entityConflict.serverEtag,
    };
    try {
      const res = await fetch(`${endpoint}/${encodeURIComponent(name ?? "")}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          rawConfigText: entityConflict.localContent,
          metadata,
        }),
      });
      if (res.ok) {
        setConflict(null);
      }
    } catch {
      // If force-overwrite fails, keep the conflict dialog open
    }
  }, [entityConflict, endpoint, name, metadata, setConflict]);

  const handleAcceptServer = useCallback(() => {
    // Discard local changes, reload entity from server
    setConflict(null);
    discard();
  }, [setConflict, discard]);

  const handleDismissConflict = useCallback(() => {
    setConflict(null);
  }, [setConflict]);

  return {
    entityConflict,
    handleAcceptLocal,
    handleAcceptServer,
    handleDismissConflict,
  };
}
