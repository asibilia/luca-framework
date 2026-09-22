/**
 * effort.ts — effort / service-tier / token estimation for the luca-code.
 *
 * Ports macaz `internal/protocol/types.go` helpers that classify an
 * Anthropic Messages `Request` into the OpenAI Responses "reasoning effort"
 * vocabulary. The Anthropic client expresses reasoning depth via
 * `thinking.budget_tokens`; OpenAI expresses it as a discrete level. These
 * helpers translate between the two.
 *
 *   thinking.budget_tokens buckets:
 *     >=64000  -> "max"
 *     >=32000  -> "xhigh"
 *     >=16000  -> "high"
 *     >=4000   -> "medium"
 *     >0       -> "low"
 *     adaptive -> fallback (no fixed budget; defer to caller default)
 *
 * Compaction requests (system prompt contains the marker phrase) are clamped
 * to "low" regardless of the requested budget — summarization must stay cheap.
 */

import { z } from "zod";

import { DecodeBlocks, SystemText } from "./protocol/types";
import type { Request } from "./protocol/types";

/** The discrete reasoning-effort vocabulary used by the Responses API. */
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/**
 * Schema for the raw `thinking` field on a `Request`. Passthrough keeps
 * unknown fields for round-trip fidelity. `type` distinguishes the
 * "enabled" (fixed budget) vs "adaptive" (no fixed budget) shapes.
 */
const ThinkingSchema = z
  .object({
    type: z.string().optional(),
    budget_tokens: z.number().optional(),
  })
  .passthrough();

/** Substring that marks a request as a context-compaction summarization. */
const COMPACTION_MARKER = "tasked with summarizing conversations";

/**
 * True when the system prompt contains the compaction marker phrase. macaz
 * keys compaction detection off this string; the assistant is instructed to
 * summarize prior conversation, which is the cheap, low-effort path.
 */
export function IsCompactionRequest(req: Request): boolean {
  return SystemText(req.system).includes(COMPACTION_MARKER);
}

/**
 * Map an Anthropic `Request`'s `thinking.budget_tokens` (or a fallback) to a
 * discrete `Effort` level.
 *
 * - Compaction requests always clamp to `"low"`.
 * - `thinking.type === "adaptive"` (or any non-fixed budget) falls back to
 *   `fallback`, since there is no concrete budget to bucket.
 * - Missing/zero/non-numeric budget also falls back.
 *
 * `fallback` is the caller's chosen default effort (e.g. from config).
 */
export function Effort(req: Request, fallback: Effort): Effort {
  if (IsCompactionRequest(req)) return "low";

  const parsed = ThinkingSchema.safeParse(req.thinking);
  if (!parsed.success) return fallback;
  const t = parsed.data;

  if (t.type === "adaptive") return fallback;

  const budget = t.budget_tokens;
  if (typeof budget !== "number" || budget <= 0) return fallback;
  if (budget >= 64_000) return "max";
  if (budget >= 32_000) return "xhigh";
  if (budget >= 16_000) return "high";
  if (budget >= 4_000) return "medium";
  return "low";
}

/**
 * Total ordering rank for an `Effort` level, for comparison ("is this request
 * more expensive than that one?"). Higher effort -> higher rank. Unknown
 * values rank at 0 so callers can safely compare against arbitrary strings.
 *
 *   low=1, medium=2, high=3, xhigh=4, max=5
 */
export function effortRank(effort: Effort): number {
  switch (effort) {
    case "low":
      return 1;
    case "medium":
      return 2;
    case "high":
      return 3;
    case "xhigh":
      return 4;
    case "max":
      return 5;
    default:
      return 0;
  }
}

/**
 * Resolve the OpenAI service tier for a request. macaz only exposes one
 * explicit mapping: `speed === "fast"` -> `"priority"`. Anything else yields
 * an empty string (the caller may omit the field or pass a default).
 */
export function ServiceTier(req: Request): string {
  if (req.speed === "fast") return "priority";
  return "";
}

/**
 * Conservative input-token estimate for a request.
 *
 * Heuristic (ported from macaz): count characters of textual content, count
 * each image as a fixed 8000-char allowance (real image tokens vary; 8k is a
 * deliberate over-estimate), and EXCLUDE base64 image payload bytes from the
 * char count. Divide the total by 4 (the rough chars-per-token ratio) and
 * floor the result (Go integer-division semantics).
 *
 * Counted content:
 *   - system prompt text
 *   - text blocks in every message
 *   - tool_use input serialized to JSON (the schema the model must produce)
 *   - tool_result string content (prior tool output fed back as input)
 *   - each image block -> +8000 chars (base64 `source.data` excluded)
 *
 * Thinking blocks are NOT counted: extended-thinking is generated output, not
 * input the model must consume.
 */
export function EstimateInputTokens(req: Request): number {
  let chars = SystemText(req.system).length;

  for (const msg of req.messages) {
    for (const block of DecodeBlocks(msg.content)) {
      if (block.type === "text") {
        if (typeof block.text === "string") chars += block.text.length;
      } else if (block.type === "image") {
        chars += 8_000;
      } else if (block.type === "tool_use") {
        try {
          chars += JSON.stringify(block.input ?? {}).length;
        } catch {
          // Non-serializable input: skip rather than crash the estimate.
        }
      } else if (block.type === "tool_result") {
        if (typeof block.content === "string") {
          chars += block.content.length;
        }
      }
      // thinking / other block variants: not counted as input.
    }
  }

  return Math.floor(chars / 4);
}