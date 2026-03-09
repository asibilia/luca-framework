/**
 * Zod schemas for the MuninnDB emission layer.
 *
 * Defines all schema types for emitter configuration, circuit breaker,
 * batch queue, emission events, engrams, and metadata.
 *
 * All API-facing fields use snake_case per project conventions.
 * All optional fields define defaults in the schema (never in destructuring).
 *
 * @module emitter/schemas
 */
import { z } from "zod";

// ─── Circuit Breaker Config ─────────────────────────────────────────────────

/**
 * Circuit breaker configuration for MuninnDB HTTP calls.
 *
 * Uses snake_case for all properties per API conventions.
 *
 * @example
 * ```typescript
 * const config = circuitBreakerConfigSchema.parse({});
 * // { max_failures: 5, reset_timeout_ms: 30000, half_open_max: 1 }
 * ```
 */
export const circuitBreakerConfigSchema = z.object({
  /** Number of consecutive failures before opening the circuit. */
  max_failures: z.number().int().positive().default(5),
  /** Milliseconds to wait before transitioning from open to half-open. */
  reset_timeout_ms: z.number().int().positive().default(30_000),
  /** Maximum probe requests allowed in half-open state. */
  half_open_max: z.number().int().positive().default(1),
});

export type CircuitBreakerConfig = z.infer<typeof circuitBreakerConfigSchema>;

// ─── Batch Queue Config ─────────────────────────────────────────────────────

/**
 * Batch queue configuration for accumulating engrams before flush.
 *
 * Uses snake_case for all properties per API conventions.
 *
 * @example
 * ```typescript
 * const config = batchQueueConfigSchema.parse({});
 * // { flush_interval_ms: 2000, threshold: 10 }
 * ```
 */
export const batchQueueConfigSchema = z.object({
  /** Milliseconds between automatic timer-based flushes. */
  flush_interval_ms: z.number().int().positive().default(2_000),
  /** Number of queued engrams that triggers an immediate flush. */
  threshold: z.number().int().positive().default(10),
});

export type BatchQueueConfig = z.infer<typeof batchQueueConfigSchema>;

// ─── Emitter Config ─────────────────────────────────────────────────────────

/**
 * Top-level emitter configuration.
 *
 * Combines MuninnDB connection settings with circuit breaker and batch queue
 * sub-configurations. All fields have defaults so the emitter can initialize
 * with an empty config object.
 *
 * Uses snake_case for all properties per API conventions.
 *
 * @example
 * ```typescript
 * const config = emitterConfigSchema.parse({});
 * // { base_url: "http://127.0.0.1:8476", api_key: "", vault: "default", ... }
 * ```
 */
export const emitterConfigSchema = z.object({
  /** MuninnDB HTTP API base URL. */
  base_url: z.string().default("http://127.0.0.1:8476"),
  /** Bearer token for MuninnDB authentication. Empty string means no auth. */
  api_key: z.string().default(""),
  /** MuninnDB vault name for storing emission engrams. */
  vault: z.string().default("default"),
  /** HTTP request timeout in milliseconds. */
  timeout_ms: z.number().int().positive().default(5_000),
  /** Circuit breaker sub-configuration. */
  circuit_breaker: circuitBreakerConfigSchema.default({
    max_failures: 5,
    reset_timeout_ms: 30_000,
    half_open_max: 1,
  }),
  /** Batch queue sub-configuration. */
  batch: batchQueueConfigSchema.default({
    flush_interval_ms: 2_000,
    threshold: 10,
  }),
});

export type EmitterConfig = z.infer<typeof emitterConfigSchema>;

// ─── Emission Metadata ──────────────────────────────────────────────────────

/**
 * Common metadata fields attached to every emission event.
 *
 * Uses snake_case for all properties per API conventions.
 */
export const emissionMetadataSchema = z.object({
  /** Current milestone version (e.g., "v3.2.0"). */
  milestone: z.string().optional(),
  /** Current phase number. */
  phase: z.number().int().optional(),
  /** Task complexity level (e.g., "COMPLEX"). */
  complexity: z.string().optional(),
  /** Git branch name. */
  branch: z.string().optional(),
});

export type EmissionMetadata = z.infer<typeof emissionMetadataSchema>;

// ─── Emission Event ─────────────────────────────────────────────────────────

/**
 * Structured event payload for emission content.
 *
 * This is the JSON structure stored in the engram's `content` field.
 * Uses snake_case for all properties per API conventions.
 *
 * @example
 * ```typescript
 * const event = emissionEventSchema.parse({
 *   event_type: "phase:complete",
 *   timestamp: new Date().toISOString(),
 *   session_id: "abc-123",
 *   data: { phase_id: 1, status: "passed" },
 * });
 * ```
 */
export const emissionEventSchema = z.object({
  /** Event type identifier (e.g., "session:start", "phase:complete"). */
  event_type: z.string(),
  /** ISO 8601 timestamp of when the event occurred. */
  timestamp: z.string(),
  /** Session identifier for grouping related events. */
  session_id: z.string(),
  /** Event-specific payload data. */
  data: z.record(z.string(), z.unknown()).default({}),
  /** Common metadata fields. */
  metadata: emissionMetadataSchema.default({}),
});

export type EmissionEvent = z.infer<typeof emissionEventSchema>;

// ─── Emission Engram ────────────────────────────────────────────────────────

/**
 * MuninnDB engram shape for emission writes.
 *
 * Sent as POST body to `POST /api/engrams`.
 * Uses snake_case for all properties per API conventions.
 *
 * @example
 * ```typescript
 * const engram = emissionEngramSchema.parse({
 *   concept: "emit:session:start",
 *   content: JSON.stringify(eventPayload),
 * });
 * // { vault: "default", concept: "emit:session:start", content: "...", tags: [], confidence: 1.0 }
 * ```
 */
export const emissionEngramSchema = z.object({
  /** MuninnDB vault name. */
  vault: z.string().default("default"),
  /** Hierarchical concept ID (e.g., "emit:session:start"). */
  concept: z.string(),
  /** JSON-stringified event payload. */
  content: z.string(),
  /** Tags for filtering and categorization. */
  tags: z.array(z.string()).default([]),
  /** Confidence score (0.0 to 1.0). */
  confidence: z.number().min(0).max(1).default(1.0),
});

export type EmissionEngram = z.infer<typeof emissionEngramSchema>;
