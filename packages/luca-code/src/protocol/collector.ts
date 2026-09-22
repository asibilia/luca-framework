/**
 * protocol/collector.ts — Step 5 collector.
 *
 * Ports macaz `internal/provider/openresponses/stream.go` Collector.Handle to
 * TypeScript. Maps an OpenAI Responses SSE stream to Anthropic content blocks
 * + Anthropic streaming Events (message_start / content_block_* / text_delta /
 * input_json_delta / thinking_delta / message_delta / message_stop).
 *
 * Functional factory — no classes. `createCollector()` returns a `{ handle,
 * finalize }` pair built over closures. `handle()` is called once per inbound
 * Responses SSE event; `finalize()` is called at stream end and rejects any
 * stream that never saw a terminal event (prevents replaying partial tool
 * calls on retry) or that still has an open block.
 *
 * Three invariants govern the emission surface:
 *
 * 1. LIFECYCLE ENVELOPE. Every `response.created` / `.completed` / `.incomplete`
 *    / `.failed` / `.cancelled` payload nests its metadata under
 *    `data.response`. Those frames are validated with Zod before anything is
 *    read; a payload carrying the fields at the TOP level is malformed and
 *    latches an error rather than silently yielding `undefined` id/model and
 *    all-zero usage.
 *
 * 2. ERROR LATCH. Once `state.error` is set the collector emits NOTHING
 *    further — no `content_block_stop`, no `message_delta`, no `message_stop`,
 *    for this or any later event. A failed stream must not carry an Anthropic
 *    success terminator, or the client commits the turn and ignores the `error`
 *    frame the gateway appends afterwards. `finalize()` reports the latched
 *    error ahead of the generic structural guards.
 *
 * 3. LIFECYCLE ORDER. `state.lifecycle` is READ, not merely tracked. A terminal
 *    that arrives before a valid `response.created` latches an error rather
 *    than emitting `message_delta` + `message_stop` for a message that was
 *    never started (a fabricated success with an empty model), and a second
 *    `response.created` latches an error rather than emitting a second
 *    `message_start` after `message_stop`.
 *
 * Read-argument trailing-whitespace repair is ported from macaz
 * (repairWhitespaceStalledReadArguments + sanitizeReadArguments +
 * validReadArguments): GPT occasionally stalls emitting Read args, leaving a
 * truncated / whitespace-padded argument JSON. `repairReadArguments` is
 * exported for direct testing.
 */

import { z } from "zod";

import type { Block, EmitFunc, Event, Result, Usage } from "./types";

// ---------------------------------------------------------------------------
// Responses lifecycle validation
// ---------------------------------------------------------------------------

const UsageSchema = z
  .object({
    input_tokens: z.number().nonnegative().optional(),
    output_tokens: z.number().nonnegative().optional(),
    cache_creation_input_tokens: z.number().nonnegative().optional(),
    cache_read_input_tokens: z.number().nonnegative().optional(),
  })
  .passthrough();

/**
 * The inner `response` object carried by every Responses lifecycle SSE frame.
 *
 * Only `id` is load-bearing and therefore required. `model`, `status` and
 * `usage` are deliberately OPTIONAL: the ChatGPT-subscription endpoint is
 * reported to omit `model`, and a strict `min(1)` there would hard-fail 100% of
 * that traffic. All defaults live in the schema (never in destructuring).
 */
const LifecycleResponseSchema = z
  .object({
    id: z.string().min(1),
    model: z.string().default(""),
    status: z.string().optional(),
    usage: UsageSchema.nullish(),
  })
  .passthrough();

/** Terminal frames additionally carry `incomplete_details` and/or `error`. */
const TerminalResponseSchema = LifecycleResponseSchema.extend({
  incomplete_details: z
    .object({ reason: z.string().min(1) })
    .passthrough()
    .nullish(),
  error: z
    .object({ message: z.string().min(1), code: z.string().optional() })
    .passthrough()
    .nullish(),
});

/**
 * The wire envelope. Every lifecycle field lives under `data.response`:
 *   {"type":"response.created","sequence_number":0,"response":{...}}
 * A payload carrying the metadata at the TOP level is malformed.
 */
const CreatedEnvelopeSchema = z.object({
  response: LifecycleResponseSchema,
});

const TerminalEnvelopeSchema = z.object({
  response: TerminalResponseSchema,
});

// ---------------------------------------------------------------------------
// Collector state (kept in the closure; never exposed by reference)
// ---------------------------------------------------------------------------

interface CollectorState {
  responseId: string;
  model: string;
  blocks: Block[];
  lifecycle: "awaiting_created" | "active" | "terminal";
  openBlockIndex: number | null;
  /** accumulating JSON argument string for the currently-open tool_use block */
  inputBuffer: string;
  /** accumulating text for the currently-open text block */
  textBuffer: string;
  /** accumulating thinking text for the currently-open thinking block */
  thinkingBuffer: string;
  usage: Usage;
  terminalReceived: boolean;
  stopReason: string;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Read-argument trailing-whitespace repair
// ---------------------------------------------------------------------------

/**
 * Validate that a string parses as a JSON object carrying a string `file_path`
 * — the minimal shape of a Read tool call. Returns true only when both the
 * parse succeeds and `file_path` is a string.
 */
function validReadArguments(s: string): boolean {
  try {
    const parsed: unknown = JSON.parse(s);
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as Record<string, unknown>)["file_path"] === "string"
    );
  } catch {
    return false;
  }
}

/**
 * Sanitize a (possibly stalled/truncated) Read-arguments JSON string.
 *
 * - Empty/whitespace-only input becomes `"{}"`.
 * - Already-valid input is returned verbatim.
 * - Otherwise, attempt to recover `file_path` via a tolerant regex and rebuild
 *   a minimal `{"file_path":"..."}` object. The regex honours escaped chars
 *   inside the value so paths containing quotes/backslashes survive.
 * - If recovery fails, the trimmed input is returned as-is (best-effort).
 */
function sanitizeReadArguments(s: string): string {
  const trimmed = s.trim();
  if (trimmed === "") return "{}";
  if (validReadArguments(trimmed)) return trimmed;

  const match = trimmed.match(/"file_path"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (match && match[1] !== undefined) {
    return JSON.stringify({ file_path: match[1] });
  }
  return trimmed;
}

/**
 * Repair and parse a (possibly stalled) Read-arguments string into a value
 * suitable for a `tool_use` block's `input` field.
 *
 * On success returns the parsed object. On total failure returns the original
 * argument string so callers can decide how to degrade (the collector then
 * defaults the block input to `{}` to keep the wire shape an object).
 *
 * Exported for direct unit testing.
 */
export function repairReadArguments(args: string): unknown {
  const sanitized = sanitizeReadArguments(args);
  try {
    return JSON.parse(sanitized);
  } catch {
    return args;
  }
}

/** True when a block is a Read tool_use call. */
function isRead(block: Block): boolean {
  return block.name === "Read";
}

/**
 * Apply the Read-argument trailing-whitespace repair to a block in place.
 * Only acts on Read blocks whose input is a string (raw, unparsed) or missing;
 * leaves already-parsed object inputs untouched.
 */
function repairWhitespaceStalledReadArguments(block: Block): void {
  if (!isRead(block)) return;
  if (block.input !== undefined && typeof block.input === "object") return;
  const raw = typeof block.input === "string" ? block.input : "";
  const repaired = repairReadArguments(raw);
  if (typeof repaired === "object" && repaired !== null) {
    block.input = repaired;
  }
}

// ---------------------------------------------------------------------------
// Stop-reason mapping
// ---------------------------------------------------------------------------

/** True when the assembled block list contains at least one tool_use block. */
function hasToolUse(blocks: Block[]): boolean {
  return blocks.some((b) => b.type === "tool_use");
}

/**
 * Map a terminal Responses event + collector state to an Anthropic
 * `stop_reason`. The macaz mapping:
 *   - incomplete + `max_output_tokens`  -> "max_tokens"
 *   - failed                            -> "StreamError" (surfaced as an error
 *                                         result; see finalize)
 *   - completed / cancelled / other      -> "tool_use" if any tool_use block
 *                                         was emitted, else "end_turn"
 */
function mapStopReason(
  event: string,
  response: Record<string, unknown>,
  blocks: Block[],
): string {
  if (event === "response.incomplete") {
    const details = response["incomplete_details"] as Record<string, unknown> | undefined;
    if (details && details["reason"] === "max_output_tokens") {
      return "max_tokens";
    }
    return "end_turn";
  }
  if (event === "response.failed") {
    return "StreamError";
  }
  // completed / cancelled / anything else
  return hasToolUse(blocks) ? "tool_use" : "end_turn";
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

/**
 * Read the usage object from the inner `response` object of a lifecycle frame,
 * or null when the frame carries no usage.
 *
 * ABSENCE IS PRESERVED. Every field of the wire `usage` object is optional
 * (see {@link UsageSchema}), and a terminal frame is permitted to carry a
 * PARTIAL usage — e.g. `{output_tokens: 7}` with no `input_tokens`. Coercing
 * the missing fields to 0 here would make the `!== undefined` merge guards in
 * {@link handleTerminal} dead and silently destroy the `input_tokens` captured
 * at `response.created`. The 0-defaulting happens at the `Usage` boundary
 * (`state.usage`, which starts at `{input_tokens: 0, output_tokens: 0}`).
 */
function readUsage(response: Record<string, unknown>): Partial<Usage> | null {
  const u = response["usage"] as Record<string, unknown> | undefined;
  if (!u) return null;
  const out: Partial<Usage> = {};
  if (typeof u["input_tokens"] === "number") {
    out.input_tokens = u["input_tokens"];
  }
  if (typeof u["output_tokens"] === "number") {
    out.output_tokens = u["output_tokens"];
  }
  if (typeof u["cache_creation_input_tokens"] === "number") {
    out.cache_creation_input_tokens = u["cache_creation_input_tokens"];
  }
  if (typeof u["cache_read_input_tokens"] === "number") {
    out.cache_read_input_tokens = u["cache_read_input_tokens"];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Event emitters
// ---------------------------------------------------------------------------

function emitMessageStart(state: CollectorState, emit: EmitFunc): void {
  const event: Event = {
    type: "message_start",
    message: {
      id: state.responseId,
      type: "message",
      role: "assistant",
      model: state.model,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: {
        input_tokens: state.usage.input_tokens,
        output_tokens: 0,
      },
    },
  };
  emit(event);
}

function emitContentBlockStart(
  state: CollectorState,
  emit: EmitFunc,
  block: Block,
): void {
  const index = state.blocks.length - 1;
  // The start event carries a placeholder content_block; tool_use uses input:{}
  // (the real input arrives via input_json_delta and is finalized on done).
  const contentBlock: Record<string, unknown> = { type: block.type };
  if (block.type === "tool_use") {
    contentBlock["id"] = block.id;
    contentBlock["name"] = block.name;
    contentBlock["input"] = {};
  } else if (block.type === "text") {
    contentBlock["text"] = "";
  } else if (block.type === "thinking") {
    contentBlock["thinking"] = "";
  }
  emit({ type: "content_block_start", index, content_block: contentBlock });
}

function emitContentBlockStop(state: CollectorState, emit: EmitFunc): void {
  if (state.openBlockIndex === null) return;
  emit({ type: "content_block_stop", index: state.openBlockIndex });
}

function emitMessageDelta(
  state: CollectorState,
  emit: EmitFunc,
): void {
  // Carry the full usage (input + output + cache tokens) in message_delta,
  // matching macaz `streamMessages` (server.go:374 sends `result.Usage`). The
  // earlier shape sent only `{output_tokens}`, dropping input_tokens and the
  // cache fields the upstream actually provided.
  emit({
    type: "message_delta",
    delta: {
      stop_reason: state.stopReason,
      stop_sequence: null,
    },
    usage: { ...state.usage },
  });
}

function emitMessageStop(emit: EmitFunc): void {
  emit({ type: "message_stop" });
}

// ---------------------------------------------------------------------------
// Per-event handlers
// ---------------------------------------------------------------------------

/**
 * response.created — validate the wire envelope, then capture response
 * metadata and input usage from the inner `response` object.
 *
 * A malformed envelope latches `state.error`, emits NOTHING, and (via the
 * emission gate in `handle`) makes every subsequent event a silent no-op —
 * otherwise a later `output_text.delta` would emit an orphan
 * `content_block_start` with no preceding `message_start`.
 *
 * LIFECYCLE ORDER IS ENFORCED. A second `response.created` is a protocol
 * violation, not a restart: re-emitting `message_start` would put one AFTER the
 * `message_stop` of the first message, and re-reading the envelope would
 * silently overwrite the model/id the client has already been told. It latches
 * an error instead.
 */
function handleCreated(
  state: CollectorState,
  data: Record<string, unknown>,
  emit: EmitFunc,
): void {
  if (state.lifecycle !== "awaiting_created") {
    state.error = `unexpected response.created after the stream was already ${state.lifecycle}`;
    return;
  }
  const parsed = CreatedEnvelopeSchema.safeParse(data);
  if (!parsed.success) {
    state.error = `malformed response.created: ${parsed.error.message}`;
    return;
  }
  const response = parsed.data.response as Record<string, unknown>;

  state.responseId = parsed.data.response.id;
  state.model = parsed.data.response.model;
  state.lifecycle = "active";
  const usage = readUsage(response);
  if (usage) {
    // response.created carries input_tokens; output_tokens is finalized later
    if (usage.input_tokens !== undefined) state.usage.input_tokens = usage.input_tokens;
    if (usage.cache_creation_input_tokens !== undefined) {
      state.usage.cache_creation_input_tokens = usage.cache_creation_input_tokens;
    }
    if (usage.cache_read_input_tokens !== undefined) {
      state.usage.cache_read_input_tokens = usage.cache_read_input_tokens;
    }
  }
  emitMessageStart(state, emit);
}

/**
 * response.output_item.added — open a new block.
 *   - function_call -> tool_use block (start accumulating arguments)
 *   - reasoning     -> thinking block, only when encrypted_content is present
 *   - message       -> noop (text block is opened lazily on first delta)
 */
function handleOutputItemAdded(
  state: CollectorState,
  data: Record<string, unknown>,
  emit: EmitFunc,
): void {
  const item = data["item"] as Record<string, unknown> | undefined;
  if (!item) return;
  const type = typeof item["type"] === "string" ? (item["type"] as string) : "";

  if (type === "function_call") {
    // Only `call_id` is load-bearing: it is the key the tool round trip is
    // built on (`tool_use.id` -> `function_call.call_id` and
    // `tool_result.tool_use_id` -> `function_call_output.call_id`). Without it
    // the tool result can never be matched upstream, so a missing/empty
    // `call_id` is a hard failure. The Responses ITEM id is never sent back
    // upstream, so an item that omits it still yields a usable tool call.
    const callId = typeof item["call_id"] === "string" ? item["call_id"] : "";
    if (callId.length === 0) {
      state.error =
        "invalid function_call identity: a non-empty call_id is required for the tool round trip";
      return;
    }
    const block: Block = {
      type: "tool_use",
      id: callId,
      name: typeof item["name"] === "string" ? item["name"] : "",
      input: {},
    };
    state.blocks.push(block);
    state.openBlockIndex = state.blocks.length - 1;
    state.inputBuffer =
      typeof item["arguments"] === "string" ? (item["arguments"] as string) : "";
    emitContentBlockStart(state, emit, block);
    return;
  }

  if (type === "reasoning") {
    // Only emit a thinking block when encrypted_content is available — the
    // signature is required for extended-thinking round-trips.
    if (item["encrypted_content"] === undefined) return;
    const block: Block = {
      type: "thinking",
      thinking: "",
      signature: undefined,
    };
    state.blocks.push(block);
    state.openBlockIndex = state.blocks.length - 1;
    state.thinkingBuffer = "";
    emitContentBlockStart(state, emit, block);
    return;
  }

  // message (or anything else) — noop. Text block is opened lazily on the
  // first output_text.delta so empty message items never produce empty blocks.
}

/** response.output_text.delta — lazy-open a text block, then stream text_delta. */
function handleOutputTextDelta(
  state: CollectorState,
  data: Record<string, unknown>,
  emit: EmitFunc,
): void {
  const delta = typeof data["delta"] === "string" ? (data["delta"] as string) : "";
  // Lazy-open a text block if none is open or the open block isn't text.
  if (state.openBlockIndex === null || state.blocks[state.openBlockIndex]!.type !== "text") {
    const block: Block = { type: "text", text: "" };
    state.blocks.push(block);
    state.openBlockIndex = state.blocks.length - 1;
    state.textBuffer = "";
    emitContentBlockStart(state, emit, block);
  }
  state.textBuffer += delta;
  emit({
    type: "text_delta",
    index: state.openBlockIndex,
    text: delta,
  });
}

/** response.reasoning_summary_text.delta — thinking_delta on the open thinking block. */
function handleReasoningSummaryDelta(
  state: CollectorState,
  data: Record<string, unknown>,
  emit: EmitFunc,
): void {
  const delta = typeof data["delta"] === "string" ? (data["delta"] as string) : "";
  if (state.openBlockIndex === null) return;
  state.thinkingBuffer += delta;
  emit({
    type: "thinking_delta",
    index: state.openBlockIndex,
    thinking: delta,
  });
}

/**
 * response.function_call_arguments.delta — accumulate the JSON argument string
 * and stream input_json_delta events verbatim.
 */
function handleFunctionCallArgumentsDelta(
  state: CollectorState,
  data: Record<string, unknown>,
  emit: EmitFunc,
): void {
  const delta = typeof data["delta"] === "string" ? (data["delta"] as string) : "";
  state.inputBuffer += delta;
  if (state.openBlockIndex === null) return;
  emit({
    type: "input_json_delta",
    index: state.openBlockIndex,
    partial_json: delta,
  });
}

/**
 * response.output_item.done — finalize the open block.
 *   - tool_use: parse accumulated args; on parse failure, attempt Read-arg
 *     repair for Read blocks; default input to {} if still not an object.
 *   - thinking: set signature from encrypted_content; commit accumulated text.
 *   - text: commit accumulated text.
 * Emits content_block_stop and clears the open-block index.
 */
function handleOutputItemDone(
  state: CollectorState,
  data: Record<string, unknown>,
  emit: EmitFunc,
): void {
  if (state.openBlockIndex === null) return;
  const block = state.blocks[state.openBlockIndex]!;
  const item = data["item"] as Record<string, unknown> | undefined;
  const itemType =
    item && typeof item["type"] === "string" ? (item["type"] as string) : block.type;

  if (itemType === "function_call" || block.type === "tool_use") {
    let input: unknown;
    try {
      input = JSON.parse(state.inputBuffer);
    } catch {
      if (isRead(block)) {
        const repaired = repairReadArguments(state.inputBuffer);
        input = typeof repaired === "object" && repaired !== null ? repaired : {};
      } else {
        input = {};
      }
    }
    if (typeof input !== "object" || input === null) {
      input = {};
    }
    block.input = input;
    // Re-run the Read repair in case the JSON parsed but is malformed for Read
    // (e.g. missing file_path) — only acts on Read blocks with non-object input.
    repairWhitespaceStalledReadArguments(block);
  } else if (itemType === "reasoning" || block.type === "thinking") {
    block.thinking = state.thinkingBuffer;
    if (item && typeof item["encrypted_content"] === "string") {
      block.signature = item["encrypted_content"] as string;
    }
  } else if (block.type === "text") {
    block.text = state.textBuffer;
  }

  // For a thinking block carrying a signature (from the item's
  // encrypted_content), emit a signature_delta before the block closes so the
  // signature reaches the client on the wire — matching macaz `streamMessages`
  // (server.go:332-343), which injects a `signature_delta` content_block_delta
  // immediately before `content_block_stop`. Without this the signature was
  // stored on the block but never streamed, breaking extended-thinking
  // round-trips.
  if (
    block.type === "thinking" &&
    typeof block.signature === "string" &&
    block.signature.length > 0 &&
    state.openBlockIndex !== null
  ) {
    emit({
      type: "signature_delta",
      index: state.openBlockIndex,
      signature: block.signature,
    });
  }

  emitContentBlockStop(state, emit);
  state.openBlockIndex = null;
  state.inputBuffer = "";
  state.textBuffer = "";
  state.thinkingBuffer = "";
}

/**
 * Terminal events: response.completed / incomplete / failed / cancelled.
 *
 * Validates the wire envelope, reads final usage from `data.response`, closes
 * any open block, maps stop_reason, and emits message_delta + message_stop.
 *
 * ERROR LATCH (todo #5): the error is recorded BEFORE any emission so that a
 * failed / malformed terminal produces no `content_block_stop`, no
 * `message_delta` and no `message_stop`. Anthropic's `message_stop` terminates
 * the message — writing one for a failed upstream response would make the
 * client commit a bogus successful turn and ignore the trailing `error` frame.
 * State (usage, closeOpen, terminalReceived, stopReason) is still updated; only
 * the wire emissions are suppressed, by the gate in `handle`.
 *
 * LIFECYCLE ORDER IS ENFORCED (the companion half of the guard in
 * {@link handleCreated}). A terminal that arrives before a valid
 * `response.created` would otherwise emit `message_delta` + `message_stop` with
 * NO preceding `message_start` and `finalize()` would report ok — a fabricated
 * success carrying an empty message and an empty model. That is exactly the
 * failure class the error latch exists to prevent, so an out-of-order terminal
 * latches an error and emits nothing.
 */
function handleTerminal(
  state: CollectorState,
  event: string,
  data: Record<string, unknown>,
  emit: EmitFunc,
): void {
  if (state.lifecycle === "awaiting_created") {
    state.error = `${event} before response.created`;
    return;
  }
  if (state.lifecycle === "terminal") {
    state.error = `duplicate terminal ${event} after the stream already ended`;
    return;
  }
  const parsed = TerminalEnvelopeSchema.safeParse(data);
  if (!parsed.success) {
    state.error = `malformed ${event}: ${parsed.error.message}`;
    return;
  }
  const response = parsed.data.response as Record<string, unknown>;

  if (event === "response.failed") {
    const err = parsed.data.response.error;
    state.error =
      err && typeof err.message === "string" ? err.message : "response failed";
  }

  const usage = readUsage(response);
  if (usage) {
    if (usage.output_tokens !== undefined) state.usage.output_tokens = usage.output_tokens;
    if (usage.input_tokens !== undefined) state.usage.input_tokens = usage.input_tokens;
    if (usage.cache_creation_input_tokens !== undefined) {
      state.usage.cache_creation_input_tokens = usage.cache_creation_input_tokens;
    }
    if (usage.cache_read_input_tokens !== undefined) {
      state.usage.cache_read_input_tokens = usage.cache_read_input_tokens;
    }
  }

  // closeOpen: if a block is still open, finalize it without an output_item.done
  if (state.openBlockIndex !== null) {
    const block = state.blocks[state.openBlockIndex]!;
    if (block.type === "tool_use") {
      let input: unknown;
      try {
        input = JSON.parse(state.inputBuffer);
      } catch {
        input = isRead(block) ? repairReadArguments(state.inputBuffer) : {};
        if (typeof input !== "object" || input === null) input = {};
      }
      if (typeof input !== "object" || input === null) input = {};
      block.input = input;
      repairWhitespaceStalledReadArguments(block);
    } else if (block.type === "text") {
      block.text = state.textBuffer;
    } else if (block.type === "thinking") {
      block.thinking = state.thinkingBuffer;
    }
    emitContentBlockStop(state, emit);
    state.openBlockIndex = null;
  }

  state.stopReason = mapStopReason(event, response, state.blocks);
  state.terminalReceived = true;
  state.lifecycle = "terminal";

  emitMessageDelta(state, emit);
  emitMessageStop(emit);
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

export interface Collector {
  /** Process one inbound Responses SSE event. */
  handle(ev: { event: string; data: unknown }, emit: EmitFunc): void;
  /** Finalize the stream; rejects partial / open-block streams. */
  finalize(): { result: Result; ok: boolean; error?: string };
}

/**
 * Create a new collector. Each call yields an independent collector instance
 * (pure factory; no shared mutable state across calls).
 */
export function createCollector(): Collector {
  const state: CollectorState = {
    responseId: "",
    model: "",
    blocks: [],
    lifecycle: "awaiting_created",
    openBlockIndex: null,
    inputBuffer: "",
    textBuffer: "",
    thinkingBuffer: "",
    usage: { input_tokens: 0, output_tokens: 0 },
    terminalReceived: false,
    stopReason: "end_turn",
    error: null,
  };

  function handle(ev: { event: string; data: unknown }, emit: EmitFunc): void {
    const data = (ev.data ?? {}) as Record<string, unknown>;

    // EMISSION GATE — once `state.error` is latched the collector never writes
    // another Anthropic event, for this or any later inbound event. State keeps
    // updating (usage, terminalReceived, closeOpen) so `finalize` can report
    // accurately, but the wire stays silent: a stream that failed must never
    // carry a success terminator, and a stream whose `response.created` was
    // malformed must never emit an orphan `content_block_start`.
    const gatedEmit: EmitFunc = (event: Event) => {
      if (state.error !== null) return;
      return emit(event);
    };

    switch (ev.event) {
      case "response.created":
        handleCreated(state, data, gatedEmit);
        break;
      case "response.output_item.added":
        handleOutputItemAdded(state, data, gatedEmit);
        break;
      case "response.output_text.delta":
        handleOutputTextDelta(state, data, gatedEmit);
        break;
      case "response.reasoning_summary_text.delta":
        handleReasoningSummaryDelta(state, data, gatedEmit);
        break;
      case "response.function_call_arguments.delta":
        handleFunctionCallArgumentsDelta(state, data, gatedEmit);
        break;
      case "response.output_item.done":
        handleOutputItemDone(state, data, gatedEmit);
        break;
      case "response.completed":
      case "response.incomplete":
      case "response.failed":
      case "response.cancelled":
        handleTerminal(state, ev.event, data, gatedEmit);
        break;
      default:
        // Unknown events are ignored — the collector is tolerant of new
        // Responses SSE event types it has not been taught about.
        break;
    }
  }

  function finalize(): { result: Result; ok: boolean; error?: string } {
    // A latched error (upstream `response.failed`, a malformed envelope, or a
    // function_call missing its call_id) is the REAL reason the stream failed
    // and must win over the generic structural guards below — otherwise a
    // malformed `response.created` surfaces as "stream ended without a terminal
    // event" and the operator never learns what actually went wrong.
    if (state.error !== null) {
      return {
        result: emptyResult(state),
        ok: false,
        error: state.error,
      };
    }
    if (!state.terminalReceived) {
      return {
        result: emptyResult(state),
        ok: false,
        error: "stream ended without a terminal event (response.completed/incomplete/failed/cancelled)",
      };
    }
    if (state.openBlockIndex !== null) {
      return {
        result: emptyResult(state),
        ok: false,
        error: "stream ended with an open content block",
      };
    }
    return {
      result: {
        model: state.model,
        blocks: state.blocks,
        stop_reason: state.stopReason,
        usage: state.usage,
      },
      ok: true,
    };
  }

  return { handle, finalize };
}

function emptyResult(state: CollectorState): Result {
  return {
    model: state.model,
    blocks: state.blocks,
    stop_reason: state.stopReason,
    usage: state.usage,
  };
}