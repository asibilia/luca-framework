import { z } from "zod";

/**
 * API Request: Observer event ingestion payload.
 *
 * Received from Luca hooks via HTTP POST.
 * Uses snake_case for API compatibility.
 */
export const ObserverEventSchema = z.object({
  event_type: z.string(),
  event_subtype: z.string().optional(),
  session_id: z.string().optional(),
  timestamp: z.string().optional(),
  payload: z.record(z.unknown()).optional(),
  agent_name: z.string().optional(),
  tool_name: z.string().optional(),
  file_path: z.string().optional(),
  duration_ms: z.number().optional(),
  status: z.string().optional(),
  phase_id: z.number().optional(),
  complexity: z.string().optional(),
});

export type ObserverEvent = z.infer<typeof ObserverEventSchema>;

/**
 * Internal type: Stored event with auto-generated fields.
 */
export const StoredEventSchema = ObserverEventSchema.extend({
  id: z.number(),
  timestamp_ms: z.number(),
});

export type StoredEvent = z.infer<typeof StoredEventSchema>;

/**
 * Internal type: Session record.
 */
export const SessionRecordSchema = z.object({
  id: z.string(),
  started_at: z.string(),
  ended_at: z.string().optional(),
  ticket_id: z.string().optional(),
  branch: z.string().optional(),
  complexity: z.string().optional(),
  status: z.string().default("active"),
  total_events: z.number().default(0),
  metadata: z.record(z.unknown()).default({}),
});

export type SessionRecord = z.infer<typeof SessionRecordSchema>;

/**
 * API Response: Event ingestion acknowledgment.
 *
 * Uses snake_case for API compatibility.
 */
export const EventResponseSchema = z.object({
  id: z.number(),
  received: z.boolean(),
});

export type EventResponse = z.infer<typeof EventResponseSchema>;

/**
 * Workflow state snapshot (read from .planning/STATE.md or bridge).
 */
export const WorkflowSnapshotSchema = z.object({
  workflow_state: z.string().default("idle"),
  current_phase: z.number().default(0),
  current_plan: z.string().default(""),
  complexity: z.string().default("MODERATE"),
  oversight: z.string().default("milestone"),
  ticket_id: z.string().default(""),
  branch: z.string().default(""),
  session_id: z.string().default(""),
  errors: z.array(z.string()).default([]),
});

export type WorkflowSnapshot = z.infer<typeof WorkflowSnapshotSchema>;
