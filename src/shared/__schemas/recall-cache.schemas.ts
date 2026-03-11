/**
 * Zod schemas for the session-scoped recall cache.
 *
 * Defines the engram and cache entry shapes used by the recall cache
 * in `__helpers/recall-cache.ts` and consumed by memory-feedback and
 * memory-context-builder.
 *
 * Uses camelCase since these are internal schemas, not API payloads.
 *
 * @module shared/__schemas/recall-cache.schemas
 */
import { z } from "zod";

// ─── Recalled Engram Schema ──────────────────────────────────────────────────

/**
 * A single recalled engram with its MuninnDB metadata.
 *
 * Tracks the engram ID alongside its content, enabling feedback loops
 * (via `muninn_feedback`) that connect verification outcomes back to
 * specific recalled engrams. Uses camelCase since this is an internal
 * schema, not an API payload.
 *
 * @example
 * ```typescript
 * const engram: RecalledEngram = {
 *   engramId: "01JEXAMPLE123",
 *   content: "Use Bun APIs over node:fs for file operations",
 *   concept: "pattern:bun-file-api",
 *   confidence: "high",
 * };
 * ```
 */
export const RecalledEngramSchema = z.object({
  /** MuninnDB engram ID (ULID format) */
  engramId: z.string().min(1),
  /** The engram content text */
  content: z.string(),
  /** The engram concept label (e.g. "pattern:bun-file-api") */
  concept: z.string().optional(),
  /** Extracted confidence level from the engram */
  confidence: z.enum(["low", "medium", "high"]).optional(),
});

export type RecalledEngram = z.infer<typeof RecalledEngramSchema>;

// ─── Recall Cache Entry Schema ──────────────────────────────────────────────

/**
 * Schema for a cached recall result from MuninnDB.
 *
 * Contains the unfiltered recall output that gets filtered per-agent
 * by `requestMemoryContext()`. Uses camelCase since this is an internal
 * schema, not an API payload.
 *
 * The `recalledEngrams` field provides structured engram tracking with IDs,
 * enabling the feedback loop. The existing string arrays (`patterns`,
 * `decisions`, `pitfalls`, `findings`) remain for `buildMemoryContextBlock()`
 * consumption. Both representations coexist for backward compatibility.
 *
 * NOTE: Migration path -- once `buildMemoryContextBlock()` is updated to
 * consume `recalledEngrams` directly (extracting content strings internally),
 * the four string arrays (`patterns`, `decisions`, `pitfalls`, `findings`)
 * should be removed to eliminate the dual representation. Track via a
 * future DRY/convention-sweep plan.
 *
 * @example
 * ```typescript
 * const entry: RecallCacheEntry = {
 *   sessionId: "session-abc-123",
 *   patterns: ["Use Bun APIs over node:fs"],
 *   decisions: ["Functional patterns only, no classes"],
 *   pitfalls: ["build:all crashes Claude Code"],
 *   findings: ["Pattern: always run tsc before commit"],
 *   recalledAt: "2026-03-09T19:55:00Z",
 *   recalledEngrams: [
 *     {
 *       engramId: "01JEXAMPLE123",
 *       content: "Use Bun APIs over node:fs",
 *       concept: "pattern:bun-file-api",
 *       confidence: "high",
 *     },
 *   ],
 * };
 * ```
 */
export const RecallCacheEntrySchema = z.object({
  /** Session ID this recall result belongs to */
  sessionId: z.string().min(1),
  /** Recalled pattern engrams from MuninnDB */
  patterns: z.array(z.string()).default([]),
  /** Recalled decision engrams from MuninnDB */
  decisions: z.array(z.string()).default([]),
  /** Recalled pitfall engrams from MuninnDB */
  pitfalls: z.array(z.string()).default([]),
  /** Recalled session findings from MuninnDB */
  findings: z.array(z.string()).default([]),
  /** ISO 8601 timestamp when the recall was performed */
  recalledAt: z.string(),
  /** Structured engram tracking with IDs for feedback loop (backward compatible default) */
  recalledEngrams: z.array(RecalledEngramSchema).default([]),
});

export type RecallCacheEntry = z.infer<typeof RecallCacheEntrySchema>;
