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
