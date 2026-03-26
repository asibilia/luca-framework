/**
 * Configuration types and per-entity constants for generic entity hooks.
 *
 * Each entity type (agent, skill, rule) provides a config object that
 * parameterizes the generic `useEntitySave`, `useEntityList`, and
 * `useEntityDetail` hooks. This eliminates triplication while keeping
 * each entity's unique field maps, endpoints, and atom factories.
 *
 * The `entityType` string is critical for Jotai atom key collision
 * prevention -- it prefixes atom family keys so that agents, skills,
 * and rules never share atoms.
 *
 * @module entity-hook-config
 */

import type { WritableAtom } from "jotai";

import {
  agentDraftAtom,
  agentHistoryAtom,
  skillDraftAtom,
  skillHistoryAtom,
  ruleDraftAtom,
  ruleHistoryAtom,
} from "~/stores/entity-atoms";
import { agentRegistryAtom } from "~/stores/config-atoms";

import type { FieldKeyMap } from "~/hooks/helpers/merge-field-overrides";

// ---------------------------------------------------------------------------
// Shared metadata extractor
// ---------------------------------------------------------------------------

/**
 * Extract the standard metadata payload from an entity draft.
 *
 * All three entity types share the same metadata shape for PUT requests.
 * The `domain` field defaults to the provided fallback when not set on
 * the draft.
 *
 * @param draft         - The entity draft record
 * @param domainDefault - Fallback value for the `domain` field
 * @returns Metadata object ready for JSON serialization
 */
function extractMetadata(
  draft: Record<string, unknown>,
  domainDefault: string,
): Record<string, unknown> {
  return {
    varName: (draft.varName as string) ?? "",
    domain: (draft.domain as string) ?? domainDefault,
    imports: (draft.imports as string[]) ?? [],
    sharedConstants: (draft.sharedConstants as string[]) ?? [],
    exportVarName: (draft.exportVarName as string) ?? "",
    factoryFn: (draft.factoryFn as string) ?? "",
    configType: (draft.configType as string) ?? "",
    prefix: (draft.prefix as string) ?? "",
    suffix: (draft.suffix as string) ?? "",
  };
}

// ---------------------------------------------------------------------------
// Config types
// ---------------------------------------------------------------------------

/**
 * Configuration for the generic `useEntitySave` hook.
 *
 * Provides the entity-specific atom factory, API endpoint, field key map
 * for merging overrides, and a metadata extractor.
 */
export type EntitySaveConfig = {
  /** Entity type identifier (e.g., "agents", "skills", "rules"). */
  entityType: string;
  /** Singular entity label for the entity key (e.g., "agent", "skill", "rule"). */
  entitySingular: string;
  /** API endpoint path (e.g., "/api/entities/agents"). */
  endpoint: string;
  /** Jotai atomFamily factory for the draft atom, keyed by entity name. */
  draftAtomFactory: (
    name: string,
  ) => WritableAtom<Record<string, unknown>, [Record<string, unknown>], void>;
  /** Field-to-config-key mapping for mergeFieldOverrides. */
  fieldKeyMap: FieldKeyMap;
  /** Extract metadata from the draft for the PUT payload. */
  extractMetadata: (draft: Record<string, unknown>) => Record<string, unknown>;
};

/**
 * Configuration for the generic `useEntityList` hook.
 *
 * Provides the entity-specific API endpoint, entity type label for error
 * messages, and an optional registry atom to populate on fetch success.
 */
export type EntityListConfig = {
  /** Entity type identifier (e.g., "agents", "skills", "rules"). */
  entityType: string;
  /** API endpoint path (e.g., "/api/entities/agents"). */
  endpoint: string;
  /** Optional Jotai atom to populate with fetched entities (server-state mirror). */
  registryAtom?: WritableAtom<unknown, [unknown], void>;
};

/**
 * Configuration for the generic `useEntityDetail` hook.
 *
 * Provides the entity-specific atom factories for draft and history,
 * the API endpoint, and the entity type label.
 */
export type EntityDetailConfig = {
  /** Entity type identifier (e.g., "agents", "skills", "rules"). */
  entityType: string;
  /** API endpoint path (e.g., "/api/entities/agents"). */
  endpoint: string;
  /** Jotai atomFamily factory for the draft atom, keyed by entity name. */
  draftAtomFactory: (
    name: string,
  ) => WritableAtom<Record<string, unknown>, [Record<string, unknown>], void>;
  /** Jotai atomFamily factory for the history atom, keyed by entity name. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  historyAtomFactory: (name: string) => WritableAtom<any, [any], void>;
};

// ---------------------------------------------------------------------------
// Per-entity config constants: SAVE
// ---------------------------------------------------------------------------

/** Agent-specific save configuration. */
export const AGENT_SAVE_CONFIG: EntitySaveConfig = {
  entityType: "agents",
  entitySingular: "agent",
  endpoint: "/api/entities/agents",
  draftAtomFactory: agentDraftAtom,
  fieldKeyMap: {
    description: ["description"],
    modelTier: ["model_tier", "modelTier"],
    purpose: ["purpose"],
    stage: ["stage"],
  },
  extractMetadata: (draft) => extractMetadata(draft, "agents"),
};

/** Skill-specific save configuration. */
export const SKILL_SAVE_CONFIG: EntitySaveConfig = {
  entityType: "skills",
  entitySingular: "skill",
  endpoint: "/api/entities/skills",
  draftAtomFactory: skillDraftAtom,
  fieldKeyMap: {
    description: ["description"],
  },
  extractMetadata: (draft) => extractMetadata(draft, "skills"),
};

/** Rule-specific save configuration. */
export const RULE_SAVE_CONFIG: EntitySaveConfig = {
  entityType: "rules",
  entitySingular: "rule",
  endpoint: "/api/entities/rules",
  draftAtomFactory: ruleDraftAtom,
  fieldKeyMap: {
    description: ["description"],
    alwaysApply: ["alwaysApply"],
  },
  extractMetadata: (draft) => extractMetadata(draft, "rules"),
};

// ---------------------------------------------------------------------------
// Per-entity config constants: LIST
// ---------------------------------------------------------------------------

/** Agent-specific list configuration. */
export const AGENT_LIST_CONFIG: EntityListConfig = {
  entityType: "agents",
  endpoint: "/api/entities/agents",
  registryAtom: agentRegistryAtom as WritableAtom<unknown, [unknown], void>,
};

/** Skill-specific list configuration. */
export const SKILL_LIST_CONFIG: EntityListConfig = {
  entityType: "skills",
  endpoint: "/api/entities/skills",
};

/** Rule-specific list configuration. */
export const RULE_LIST_CONFIG: EntityListConfig = {
  entityType: "rules",
  endpoint: "/api/entities/rules",
};

// ---------------------------------------------------------------------------
// Per-entity config constants: DETAIL
// ---------------------------------------------------------------------------

/** Agent-specific detail configuration. */
export const AGENT_DETAIL_CONFIG: EntityDetailConfig = {
  entityType: "agents",
  endpoint: "/api/entities/agents",
  draftAtomFactory: agentDraftAtom,
  historyAtomFactory: agentHistoryAtom as unknown as (
    name: string,
  ) => WritableAtom<unknown, [unknown], void>,
};

/** Skill-specific detail configuration. */
export const SKILL_DETAIL_CONFIG: EntityDetailConfig = {
  entityType: "skills",
  endpoint: "/api/entities/skills",
  draftAtomFactory: skillDraftAtom,
  historyAtomFactory: skillHistoryAtom as unknown as (
    name: string,
  ) => WritableAtom<unknown, [unknown], void>,
};

/** Rule-specific detail configuration. */
export const RULE_DETAIL_CONFIG: EntityDetailConfig = {
  entityType: "rules",
  endpoint: "/api/entities/rules",
  draftAtomFactory: ruleDraftAtom,
  historyAtomFactory: ruleHistoryAtom as unknown as (
    name: string,
  ) => WritableAtom<unknown, [unknown], void>,
};
