/**
 * Zod schemas for MuninnDB proxy route validation.
 *
 * Request schemas validate incoming data (POST bodies, query params).
 * Response schemas provide lightweight shape-checking for MuninnDB API responses.
 *
 * Uses snake_case for API-facing fields per project convention.
 */
import { z } from "zod";

// -- Request validation schemas -----------------------------------------------

/**
 * POST /api/muninn/activate — request body.
 *
 * Validates the JSON body for semantic recall activation.
 */
export const ActivateRequestSchema = z.object({
  context: z
    .array(z.string())
    .min(1, "context must be a non-empty string array"),
  vault: z.string().min(1).max(100).default("default"),
  limit: z.number().int().min(1).max(100).default(20),
});

export type ActivateRequest = z.infer<typeof ActivateRequestSchema>;

// -- Query parameter schemas --------------------------------------------------

/**
 * GET /api/muninn/engrams — query parameters.
 *
 * Uses z.coerce.number() because URLSearchParams values are always strings.
 */
export const EngramsQuerySchema = z.object({
  vault: z.string().min(1).max(100).default("default"),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  tag: z.string().optional(),
  type: z.string().optional(),
  entity: z.string().optional(),
  since: z.coerce.number().optional(),
});

export type EngramsQuery = z.infer<typeof EngramsQuerySchema>;

/**
 * GET /api/muninn/session — query parameters.
 */
export const SessionQuerySchema = z.object({
  vault: z.string().min(1).max(100).default("default"),
  limit: z.coerce.number().int().min(1).max(500).default(50),
});

export type SessionQuery = z.infer<typeof SessionQuerySchema>;

/**
 * GET /api/muninn/stats — query parameters.
 */
export const StatsQuerySchema = z.object({
  vault: z.string().min(1).max(100).default("default"),
});

export type StatsQuery = z.infer<typeof StatsQuerySchema>;

// -- Response validation schemas (lightweight shape checks) -------------------

/**
 * MuninnDB engrams listing response shape.
 */
export const EngramsResponseSchema = z.object({
  engrams: z.array(z.any()),
  total: z.number(),
});

/**
 * MuninnDB semantic recall (activate) response shape.
 */
export const ActivateResponseSchema = z.object({
  activations: z.array(z.any()),
  total_found: z.number(),
});

/**
 * MuninnDB session activity response shape.
 */
export const SessionResponseSchema = z.object({
  entries: z.array(z.any()),
  total: z.number(),
});

/**
 * MuninnDB vault statistics response shape.
 *
 * Uses passthrough() to allow additional fields from the API without rejection.
 */
export const StatsResponseSchema = z
  .object({
    engram_count: z.number(),
    vault_count: z.number(),
  })
  .passthrough();

/**
 * POST /api/muninn/forget -- request body.
 *
 * Validates the JSON body for engram deletion.
 * Uses snake_case for all properties per API conventions.
 */
export const ForgetRequestSchema = z.object({
  vault: z.string().min(1).max(100).default("default"),
  id: z.string().min(1, "id is required"),
});

export type ForgetRequest = z.infer<typeof ForgetRequestSchema>;

/**
 * MuninnDB forget response shape.
 */
export const ForgetResponseSchema = z
  .object({
    forgotten: z.boolean(),
  })
  .passthrough();

// -- New query parameter schemas for GET routes --------------------------------

/**
 * GET /api/muninn/contradictions — query parameters.
 */
export const ContradictionsQuerySchema = z.object({
  vault: z.string().min(1).max(100).default("default"),
});

export type ContradictionsQuery = z.infer<typeof ContradictionsQuerySchema>;

/**
 * GET /api/muninn/entity/[name] — query parameters (name comes from path).
 */
export const EntityQuerySchema = z.object({
  vault: z.string().min(1).max(100).default("default"),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type EntityQuery = z.infer<typeof EntityQuerySchema>;

/**
 * GET /api/muninn/entity/[name]/timeline — query parameters.
 */
export const EntityTimelineQuerySchema = z.object({
  vault: z.string().min(1).max(100).default("default"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type EntityTimelineQuery = z.infer<typeof EntityTimelineQuerySchema>;

/**
 * GET /api/muninn/entity-clusters — query parameters.
 */
export const EntityClustersQuerySchema = z.object({
  vault: z.string().min(1).max(100).default("default"),
  top_n: z.coerce.number().int().min(1).max(100).default(20),
  min_count: z.coerce.number().int().min(1).default(2),
});

export type EntityClustersQuery = z.infer<typeof EntityClustersQuerySchema>;

// -- New request body schemas for POST routes ----------------------------------

/**
 * POST /api/muninn/traverse — request body.
 *
 * Validates the JSON body for graph traversal.
 * Uses snake_case for all properties per API conventions.
 */
export const TraverseRequestSchema = z.object({
  vault: z.string().min(1).max(100).default("default"),
  start_id: z.string().min(1, "start_id is required"),
  max_hops: z.number().int().min(1).max(10).default(2),
  max_nodes: z.number().int().min(1).max(500).default(50),
  follow_entities: z.boolean().default(true),
  rel_types: z.array(z.string()).optional(),
});

export type TraverseRequest = z.infer<typeof TraverseRequestSchema>;

/**
 * POST /api/muninn/explain — request body.
 *
 * Validates the JSON body for engram scoring explanation.
 * Uses snake_case for all properties per API conventions.
 */
export const ExplainRequestSchema = z.object({
  vault: z.string().min(1).max(100).default("default"),
  engram_id: z.string().min(1, "engram_id is required"),
  query: z.array(z.string()).min(1, "query must be a non-empty string array"),
});

export type ExplainRequest = z.infer<typeof ExplainRequestSchema>;

/**
 * POST /api/muninn/find-by-entity — request body.
 *
 * Validates the JSON body for entity-based engram search.
 * Uses snake_case for all properties per API conventions.
 */
export const FindByEntityRequestSchema = z.object({
  vault: z.string().min(1).max(100).default("default"),
  entity_name: z.string().min(1, "entity_name is required"),
  limit: z.number().int().min(1).max(200).default(50),
});

export type FindByEntityRequest = z.infer<typeof FindByEntityRequestSchema>;

/**
 * POST /api/muninn/export-graph — request body.
 *
 * Validates the JSON body for graph export.
 * Uses snake_case for all properties per API conventions.
 */
export const ExportGraphRequestSchema = z.object({
  vault: z.string().min(1).max(100).default("default"),
  format: z.enum(["json-ld"]).default("json-ld"),
  include_engrams: z.boolean().default(false),
});

export type ExportGraphRequest = z.infer<typeof ExportGraphRequestSchema>;

// -- New response validation schemas -------------------------------------------

/**
 * MuninnDB contradictions response shape.
 */
export const ContradictionsResponseSchema = z
  .object({
    contradictions: z.array(z.any()),
  })
  .passthrough();

/**
 * MuninnDB graph traversal response shape.
 */
export const TraverseResponseSchema = z
  .object({
    nodes: z.array(z.any()),
    edges: z.array(z.any()),
    total_reachable: z.number(),
  })
  .passthrough();

/**
 * MuninnDB explain scoring response shape.
 */
export const ExplainResponseSchema = z
  .object({
    engram_id: z.string(),
    final_score: z.number(),
    would_return: z.boolean(),
  })
  .passthrough();

/**
 * MuninnDB entity aggregate response shape.
 */
export const EntityResponseSchema = z
  .object({
    name: z.string(),
    engrams: z.array(z.any()),
    relationships: z.array(z.any()),
  })
  .passthrough();

/**
 * MuninnDB entity timeline response shape.
 */
export const EntityTimelineResponseSchema = z
  .object({
    entity: z.string(),
    timeline: z.array(z.any()),
  })
  .passthrough();

/**
 * MuninnDB find-by-entity response shape.
 */
export const FindByEntityResponseSchema = z
  .object({
    entity: z.string(),
    engrams: z.array(z.any()),
    count: z.number(),
  })
  .passthrough();

/**
 * MuninnDB entity clusters response shape.
 */
export const EntityClustersResponseSchema = z
  .object({
    clusters: z.array(z.any()),
    count: z.number(),
  })
  .passthrough();

/**
 * MuninnDB graph export response shape.
 */
export const ExportGraphResponseSchema = z
  .object({
    data: z.string(),
    node_count: z.number(),
    edge_count: z.number(),
    format: z.string(),
  })
  .passthrough();

// -- Graph data route schemas -------------------------------------------------

/**
 * GET /api/muninn/graph-data -- query parameters.
 *
 * Returns nodes + links for ForceGraph2D visualization.
 * Uses z.coerce.number() because URLSearchParams values are always strings.
 */
export const GraphDataQuerySchema = z.object({
  vault: z.string().min(1).max(100).default("default"),
  limit: z.coerce.number().int().min(1).max(2000).default(500),
});

export type GraphDataQuery = z.infer<typeof GraphDataQuerySchema>;

/**
 * Graph data response shape.
 *
 * Returns pre-processed nodes and links ready for ForceGraph2D rendering.
 * Uses snake_case for all properties per API conventions.
 */
export const GraphDataResponseSchema = z
  .object({
    nodes: z.array(z.any()),
    links: z.array(z.any()),
    total_nodes: z.number(),
    total_links: z.number(),
  })
  .passthrough();

// -- Phase 163: Memory observability route schemas ----------------------------

/**
 * GET /api/muninn/health — no query parameters needed.
 *
 * Health is a global endpoint (vault-agnostic).
 */
export const HealthQuerySchema = z.object({});

export type HealthQuery = z.infer<typeof HealthQuerySchema>;

/**
 * MuninnDB health response shape.
 *
 * Uses passthrough() to allow additional fields from the API.
 */
export const HealthResponseSchema = z
  .object({
    status: z.string(),
    version: z.string(),
    uptime_seconds: z.number(),
    db_writable: z.boolean(),
  })
  .passthrough();

/**
 * GET /api/muninn/observations — query parameters.
 *
 * Recalls session:observation-* engrams.
 * Uses z.coerce.number() because URLSearchParams values are always strings.
 */
export const ObservationsQuerySchema = z.object({
  vault: z.string().min(1).max(100).default("default"),
  limit: z.coerce.number().int().min(1).max(500).default(50),
});

export type ObservationsQuery = z.infer<typeof ObservationsQuerySchema>;

/**
 * MuninnDB observations response shape.
 */
export const ObservationsResponseSchema = z
  .object({
    observations: z.array(z.any()),
    total: z.number(),
  })
  .passthrough();

/**
 * GET /api/muninn/metrics — query parameters.
 *
 * Recalls metric:* engrams.
 * Uses z.coerce.number() because URLSearchParams values are always strings.
 */
export const MetricsQuerySchema = z.object({
  vault: z.string().min(1).max(100).default("default"),
  limit: z.coerce.number().int().min(1).max(500).default(50),
});

export type MetricsQuery = z.infer<typeof MetricsQuerySchema>;

/**
 * MuninnDB metrics response shape.
 */
export const MetricsResponseSchema = z
  .object({
    metrics: z.array(z.any()),
    total: z.number(),
  })
  .passthrough();

/**
 * GET /api/muninn/checkpoint — no query parameters.
 *
 * Reads local .planning/.context-checkpoint.json file (no vault param).
 */
export const CheckpointQuerySchema = z.object({});

export type CheckpointQuery = z.infer<typeof CheckpointQuerySchema>;

/**
 * Checkpoint response shape.
 *
 * All fields optional since the checkpoint file may not exist yet.
 * Uses passthrough() to allow additional fields.
 */
export const CheckpointResponseSchema = z
  .object({
    zone: z.string().nullable().optional(),
    usage_percent: z.number().nullable().optional(),
    checked_at: z.string().nullable().optional(),
    observation_count: z.number().optional(),
    checkpoint_age_seconds: z.number().nullable().optional(),
  })
  .passthrough();

/**
 * GET /api/muninn/zone-history — no query parameters.
 *
 * Reads local .planning/.context-metrics.json history file.
 */
export const ZoneHistoryQuerySchema = z.object({});

export type ZoneHistoryQuery = z.infer<typeof ZoneHistoryQuerySchema>;

/**
 * Zone history response shape.
 */
export const ZoneHistoryResponseSchema = z
  .object({
    entries: z.array(z.any()),
    total: z.number(),
  })
  .passthrough();
