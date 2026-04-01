/**
 * Zod schemas for the deterministic backlog scanner.
 *
 * Defines the structured output shape for pending todo scanning.
 * Used by scan-pending.ts and consumed by the lu orchestrator
 * for WSJF scoring input.
 *
 * @module backlog/schemas
 */
import { z } from "zod";

/**
 * A single pending todo item parsed from frontmatter.
 */
export const pendingTodoSchema = z.object({
  file: z.string(),
  title: z.string().default("Untitled"),
  area: z.string().default("unknown"),
  priority: z.string().optional(),
  severity: z.string().optional(),
  created: z.string().optional(),
  age_days: z.number().int().nonnegative().default(0),
});

export type PendingTodo = z.infer<typeof pendingTodoSchema>;

/**
 * The full scanner output: an array of pending todo items.
 */
export const scanResultSchema = z.array(pendingTodoSchema);

export type ScanResult = z.infer<typeof scanResultSchema>;
