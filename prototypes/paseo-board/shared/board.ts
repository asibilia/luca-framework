import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

/**
 * Throwaway prototype for asibilia/luca-framework#343: one fake Luca run, shown two ways
 * (B, a stage stack in a workspace panel; C, rows in an agent's timeline). Variant A, the
 * sidebar surface, was retired in v2 and lives on in the branch history at 222e34c.
 * Everything here is shared by the app bundle and the daemon subprocess, so it holds only
 * Zod contracts and plain values. Words follow CONTEXT.md (ticket, gate, red check, fix loop,
 * ticket review, final review, lens, finding, stuck, escalation, skipped ticket, limit wait).
 */

/** How often the fake run advances one tick in the daemon subprocess. */
export const TICK_MS = 3000;
/** How often the panel (B) polls the fake run. */
export const POLL_MS = 2000;
/** Fix loops and review rounds are capped at 3. */
export const LOOP_CAP = 3;

/** The steps every feature ticket goes through, shown as dots on B's cards. */
export const STEP_NAMES = ["tests", "red check", "code", "checks", "review"] as const;
/** Refactor tickets skip these steps: no new test can fail first. */
export const REFACTOR_SKIPS_STEPS = 2;

/** Plan usage colors, shared so B and C match: green below 60%, yellow 60-85%, red above 85%. */
export const USAGE_YELLOW_FROM = 60;
export const USAGE_RED_ABOVE = 85;
export type UsageLevel = "ok" | "warn" | "high";
export function usageLevel(percent: number): UsageLevel {
  if (percent > USAGE_RED_ABOVE) {
    return "high";
  }
  return percent >= USAGE_YELLOW_FROM ? "warn" : "ok";
}

export const familySchema = z.enum(["claude", "gpt"]);
export const roleSchema = z.enum(["test-writer", "implementer", "reviewer"]);
export const ticketStateSchema = z.enum([
  "blocked",
  "building",
  "reviewing",
  "stuck",
  "done",
  "skipped",
]);
export const toneSchema = z.enum(["info", "success", "warning", "danger"]);
export const lensNameSchema = z.enum([
  "architecture",
  "simplification",
  "security",
  "integration",
  "rules",
]);

/** One agent: one model session doing one role on one ticket. */
export const agentSchema = z.object({
  role: roleSchema,
  family: familySchema,
  model: z.string(),
  state: z.enum(["running", "idle", "paused", "done", "failed"]),
  tokens: z.number(),
  note: z.string(),
});

export const findingsSchema = z.object({
  blocker: z.number(),
  shouldFix: z.number(),
  nit: z.number(),
});

export const stuckSchema = z.object({
  reason: z.string(),
  tried: z.array(z.string()),
  /** The exact replies the person can post as a comment on the spec issue. */
  replies: z.array(z.string()),
  waitingSeconds: z.number(),
});

export const ticketSchema = z.object({
  number: z.number(),
  title: z.string(),
  refactor: z.boolean(),
  state: ticketStateSchema,
  dependsOn: z.array(z.number()),
  /** One-word activity label. */
  activity: z.string(),
  /**
   * Index into STEP_NAMES of the current step. -1 means not started and 5 means every step
   * is done. For stuck and skipped tickets it is the step where the ticket stopped.
   */
  step: z.number().int().min(-1).max(STEP_NAMES.length),
  /** Fix loop rounds used after failed gate runs, out of LOOP_CAP. */
  fix: z.number(),
  /** Ticket review round, out of LOOP_CAP. */
  review: z.number(),
  tests: z.object({ failing: z.number(), total: z.number() }).nullable(),
  findings: findingsSchema.nullable(),
  agents: z.array(agentSchema),
  stuck: stuckSchema.nullable(),
  note: z.string().nullable(),
});

/** The stages a final-review lens moves through, in order. */
export const lensStateSchema = z.enum(["waiting", "reviewing", "fixing", "clean"]);

export const lensSchema = z.object({
  name: lensNameSchema,
  state: lensStateSchema,
  /** One-word activity label. */
  activity: z.string(),
  findings: findingsSchema,
  note: z.string().nullable(),
  /** The lens's reviewer agent (a fresh GPT session per lens). */
  model: z.string(),
  family: familySchema,
  tokens: z.number(),
});

export const finalReviewSchema = z.object({
  state: z.enum(["waiting", "reviewing", "fixing", "escalated", "stuck", "passed"]),
  round: z.number(),
  fix: z.number(),
  lenses: z.array(lensSchema),
  agents: z.array(agentSchema),
  stuck: stuckSchema.nullable(),
});

export const planUsageSchema = z.object({
  plan: z.string(),
  family: familySchema,
  fiveHour: z.number(),
  weekly: z.number(),
});

export const journalEntrySchema = z.object({
  loopTick: z.number(),
  clock: z.string(),
  ticket: z.number().nullable(),
  text: z.string(),
  tone: toneSchema,
});

export const limitWaitSchema = z.object({
  plan: z.string(),
  window: z.string(),
  resetsInSeconds: z.number(),
});

export const runSnapshotSchema = z.object({
  /** Ticks since the plugin subprocess started. */
  tick: z.number(),
  /** 1-based count of trips through the scripted loop. */
  loop: z.number(),
  loopTick: z.number(),
  loopLength: z.number(),
  scene: z.string(),
  spec: z.object({ number: z.number(), title: z.string() }),
  branch: z.string(),
  elapsedSeconds: z.number(),
  agentsRunning: z.number(),
  limitWait: limitWaitSchema.nullable(),
  usage: z.array(planUsageSchema),
  tickets: z.array(ticketSchema),
  finalReview: finalReviewSchema,
  /** Most recent journal lines of this loop, newest last. */
  journal: z.array(journalEntrySchema),
});

export type Family = z.infer<typeof familySchema>;
export type Agent = z.infer<typeof agentSchema>;
export type Findings = z.infer<typeof findingsSchema>;
export type Stuck = z.infer<typeof stuckSchema>;
export type Ticket = z.infer<typeof ticketSchema>;
export type TicketState = z.infer<typeof ticketStateSchema>;
export type Lens = z.infer<typeof lensSchema>;
export type LensState = z.infer<typeof lensStateSchema>;
export type FinalReview = z.infer<typeof finalReviewSchema>;
export type PlanUsage = z.infer<typeof planUsageSchema>;
export type JournalEntry = z.infer<typeof journalEntrySchema>;
export type LimitWait = z.infer<typeof limitWaitSchema>;
export type RunSnapshot = z.infer<typeof runSnapshotSchema>;
export type Tone = z.infer<typeof toneSchema>;

/** A and B poll this. */
export const readBoardRpc = defineRpc({
  name: "board.read",
  input: z.object({}),
  output: runSnapshotSchema,
});

/** C: start or stop the fake feed of timeline rows in one agent's timeline. */
export const feedControlRpc = defineRpc({
  name: "feed.control",
  input: z.object({ agentId: z.string().min(1), action: z.enum(["start", "stop"]) }),
  output: z.object({ ok: z.boolean(), message: z.string() }),
});

/**
 * Timeline rows for C. The daemon appends them with these kinds; the client registers one
 * renderer per kind and validates `data` with the same schema.
 */
export const ROW_VERSION = 1;
export const ROW_KIND = {
  run: "luca-board-run",
  event: "luca-board-event",
  stuck: "luca-board-stuck",
  limit: "luca-board-limit",
} as const;

export const runRowSchema = z.object({
  status: z.enum(["live", "ended", "stopped"]),
  specNumber: z.number(),
  specTitle: z.string(),
  clock: z.string(),
  agentsRunning: z.number(),
  counts: z.array(z.object({ state: ticketStateSchema, count: z.number() })),
  finalReview: z.string(),
  usage: z.array(planUsageSchema),
  limitWait: z.boolean(),
  debug: z.string(),
  footer: z.string(),
});

export const eventRowSchema = z.object({
  clock: z.string(),
  ticket: z.number().nullable(),
  text: z.string(),
  tone: toneSchema,
});

/** "ended" marks a row that was still open when its feed ended, so it no longer updates. */
export const stuckRowSchema = z.object({
  status: z.enum(["waiting", "resolved", "ended"]),
  subject: z.string(),
  specNumber: z.number(),
  reason: z.string(),
  tried: z.array(z.string()),
  replies: z.array(z.string()),
  waitingSeconds: z.number(),
  resolution: z.string().nullable(),
});

export const limitRowSchema = z.object({
  status: z.enum(["waiting", "over", "ended"]),
  plan: z.string(),
  window: z.string(),
  /** The plan's 5-hour window usage when the row was last updated. */
  fiveHour: z.number(),
  resetsInSeconds: z.number(),
  pausedAgents: z.number(),
});

export type RunRow = z.infer<typeof runRowSchema>;
export type EventRow = z.infer<typeof eventRowSchema>;
export type StuckRow = z.infer<typeof stuckRowSchema>;
export type LimitRow = z.infer<typeof limitRowSchema>;
