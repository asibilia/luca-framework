/**
 * gateway/stream.ts — Step 13 Anthropic SSE stream writer.
 *
 * Ports macaz `internal/gateway/stream.go` `streamMessages` to a Bun-native,
 * functional SSE writer. The writer produces the Anthropic streaming event
 * sequence over a `ReadableStream` body so it can be returned directly as the
 * `Response` body (Bun streams the response chunk-by-chunk).
 *
 * Event sequence (authoritative spec, step 13):
 *   - message_start            — {message:{id, type:"message", role:"assistant",
 *                                    model, content:[], stop_reason:null,
 *                                    stop_sequence:null, usage}}
 *   - content_block_start      — {index, content_block}
 *   - content_block_delta      — {index, delta:{type:"text_delta", text}}
 *   - content_block_delta      — {index, delta:{type:"thinking_delta", thinking}}
 *   - content_block_delta      — {index, delta:{type:"signature_delta", signature}}
 *   - content_block_delta      — {index, delta:{type:"input_json_delta", partial_json}}
 *   - content_block_stop       — {index}
 *   - message_delta            — {delta:{stop_reason, stop_sequence}, usage}
 *   - message_stop
 *
 * `streamMessages` wires a provider `generate` call's `emit` callback to the
 * event-writer helpers: the provider's collector already emits Anthropic-shaped
 * events, so `streamMessages` translates each collector event into the matching
 * SSE frame and writes it to the stream. The collector owns message_start /
 * message_delta / message_stop framing (it carries the upstream response id
 * and the final usage); `streamMessages` forwards them verbatim so the client
 * receives one consistent event stream.
 *
 * Functional style (closures, no classes), schema-free (the wire shape is fixed
 * by the Anthropic streaming API), Bun-native (`ReadableStream` +
 * `ReadableStreamDefaultController`).
 */

import type { Credential } from "../auth/credentials";
import type { EmitFunc, Result, Usage } from "../protocol/types";
import type { GenerateDeps } from "../provider/openai";
import type { GenerateFn, HandlerStats, MessagesRequest } from "./handlers";

/* -------------------------------------------------------------------------- */
/* SSEWriter — the write abstraction over a ReadableStream controller         */
/* -------------------------------------------------------------------------- */

/**
 * The write surface used by the event-writer helpers. Wraps a
 * `ReadableStreamDefaultController` so each `write(event, value)` enqueues one
 * canonical SSE frame (`event: <name>\ndata: <json>\n\n`) as a UTF-8 byte chunk.
 */
export interface SSEWriter {
  write(event: string, value: unknown): void;
}

/**
 * Create an {@link SSEWriter} backed by a `ReadableStreamDefaultController`.
 * Each frame is encoded UTF-8 and enqueued as a `Uint8Array`.
 */
export function createSSEWriter(controller: ReadableStreamDefaultController<Uint8Array>): SSEWriter {
  const encoder = new TextEncoder();
  return {
    write(event, value) {
      const frame = `event: ${event}\ndata: ${JSON.stringify(value)}\n\n`;
      controller.enqueue(encoder.encode(frame));
    },
  };
}

/* -------------------------------------------------------------------------- */
/* event-writer helpers                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Emit `message_start` with a minted message id and zero usage.
 *
 * `usage` defaults to `{input_tokens:0, output_tokens:0}` (the spec's "zero
 * usage"); pass an explicit usage to carry upstream input-token counts.
 */
export function startStream(
  w: SSEWriter,
  msgId: string,
  model: string,
  usage: Usage = { input_tokens: 0, output_tokens: 0 },
): void {
  w.write("message_start", {
    type: "message_start",
    message: {
      id: msgId,
      type: "message",
      role: "assistant",
      model,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage,
    },
  });
}

/**
 * Emit `content_block_start` for a given block index. `contentBlock` is the
 * Anthropic block placeholder (e.g. `{type:"text", text:""}`,
 * `{type:"tool_use", id, name, input:{}}`, `{type:"thinking", thinking:""}`).
 */
export function emitContentBlockStart(
  w: SSEWriter,
  index: number,
  contentBlock: Record<string, unknown>,
): void {
  w.write("content_block_start", {
    type: "content_block_start",
    index,
    content_block: contentBlock,
  });
}

/**
 * Emit a `content_block_delta` event carrying a typed `delta`.
 *
 * `type` is one of `text_delta` / `thinking_delta` / `signature_delta` /
 * `input_json_delta`; `delta` carries the matching partial (`{text}`,
 * `{thinking}`, `{signature}`, or `{partial_json}`).
 *
 * On the Anthropic streaming wire, ALL block deltas share the single event
 * name `content_block_delta`, with the specific delta kind nested as
 * `delta.type` (e.g. `{"type":"content_block_delta","index":0,
 * "delta":{"type":"text_delta","text":"Hi"}}`). Emitting a per-kind event
 * name (e.g. `event: text_delta`) makes the client's SSE parser open and
 * close the stream without ever accumulating block content, so the response
 * renders as blank — this was the "previous response didn't render" bug.
 */
export function emitDelta(
  w: SSEWriter,
  type: "text_delta" | "thinking_delta" | "signature_delta" | "input_json_delta",
  index: number,
  delta: Record<string, unknown>,
): void {
  w.write("content_block_delta", { type: "content_block_delta", index, delta: { type, ...delta } });
}

/**
 * Emit `content_block_stop` for a given block index. For thinking blocks the
 * caller should emit a `signature_delta` first (see {@link emitDelta}) so the
 * signature is delivered before the block closes.
 */
export function emitContentBlockStop(w: SSEWriter, index: number): void {
  w.write("content_block_stop", { type: "content_block_stop", index });
}

/**
 * Emit `message_delta` carrying the terminal `stop_reason` and the final usage.
 *
 * `usage` is the FULL usage object, forwarded unchanged. The collector
 * deliberately sends `input_tokens` and the `cache_*` fields alongside
 * `output_tokens`; re-projecting to `{output_tokens}` here used to throw them
 * away, so streaming and non-streaming reported different usage for the same
 * request. The parameter is `Partial<Usage>` rather than `Usage` so a caller
 * that legitimately only knows the output count (or an upstream payload that
 * omits fields) still type-checks.
 *
 * `stopReason` is `null` when the upstream reason is absent or not a legal
 * Anthropic stop reason — see {@link ANTHROPIC_STOP_REASONS}.
 */
export function emitMessageDelta(
  w: SSEWriter,
  stopReason: string | null,
  usage: Partial<Usage>,
): void {
  w.write("message_delta", {
    type: "message_delta",
    delta: { stop_reason: stopReason, stop_sequence: null },
    usage,
  });
}

/** Emit the terminal `message_stop` event. */
export function emitMessageStop(w: SSEWriter): void {
  w.write("message_stop", { type: "message_stop" });
}

/* -------------------------------------------------------------------------- */
/* streamMessages                                                             */
/* -------------------------------------------------------------------------- */

/** Inputs for {@link streamMessages}. Matches the spec signature. */
export interface StreamMessagesOptions {
  req: MessagesRequest;
  cred: Credential;
  /** Upstream model id (already resolved by the caller). */
  model: string;
  /** Effort used when the request has adaptive thinking (no fixed budget). */
  defaultEffort: "low" | "medium" | "high";
  /** Global cap on concurrent generate calls. */
  maxConcurrent: number;
  /**
   * Composed client-abort + request-timeout signal built by the caller
   * (`handleMessages`). Forwarded into the provider so a cancelled or timed-out
   * request tears down the upstream stream and releases its concurrency slot.
   */
  signal?: AbortSignal;
  /**
   * Production provider binding (the `providerDepsFromConfig` output). Spread
   * into the generate deps so the streaming path speaks the same upstream
   * dialect as the non-streaming path.
   */
  generateDeps?: GenerateDeps;
}

/**
 * The stop reasons the Anthropic Messages API defines. Anything outside this
 * set is forwarded as `null` rather than passed through — see
 * {@link forwardEvent}'s `message_delta` case.
 */
const ANTHROPIC_STOP_REASONS: ReadonlySet<string> = new Set([
  "end_turn",
  "max_tokens",
  "stop_sequence",
  "tool_use",
  "refusal",
  "pause_turn",
]);

/**
 * Terminal event names. These are buffered rather than written through: they
 * assert that the message ended SUCCESSFULLY, which is only knowable once
 * `generate` resolves. See {@link streamMessages}.
 */
const TERMINAL_EVENTS: ReadonlySet<string> = new Set(["message_delta", "message_stop"]);

/** Stats tracker (optional); records a result / failure for accounting. */
interface StreamStatsTracker {
  stats: HandlerStats;
  recordResult: (r: Result) => void;
  recordFailure: () => void;
}

/**
 * Translate a collector {@link Event} into the matching SSE frame on `w`.
 *
 * The collector already produces Anthropic-shaped events (message_start,
 * content_block_start, text_delta, thinking_delta, input_json_delta,
 * content_block_stop, message_delta, message_stop); this forwards each one
 * via the event-writer helpers so the client receives one consistent stream.
 */
function forwardEvent(
  w: SSEWriter,
  event: { type: string; [k: string]: unknown },
  messageModel: string,
): void {
  switch (event.type) {
    case "message_start": {
      const message = (event["message"] as Record<string, unknown>) ?? {};
      const usage = (message["usage"] as Usage | undefined) ?? { input_tokens: 0, output_tokens: 0 };
      // Use the requested public model id (what Claude Code sent, e.g.
      // `claude-luca-code-gpt-5`) for message_start.model — matching macaz
      // server.go:286 (`requestedModel`). The collector's `message.model` is
      // the upstream slug at best, and often "" because the ChatGPT
      // subscription `response.created` omits `model`; forwarding it leaves
      // the client with a blank model name.
      startStream(
        w,
        typeof message["id"] === "string" ? (message["id"] as string) : "",
        messageModel,
        usage,
      );
      return;
    }
    case "content_block_start": {
      const index = typeof event["index"] === "number" ? event["index"] : 0;
      const contentBlock = (event["content_block"] as Record<string, unknown>) ?? { type: "text" };
      emitContentBlockStart(w, index, contentBlock);
      return;
    }
    case "text_delta": {
      const index = typeof event["index"] === "number" ? event["index"] : 0;
      const text = typeof event["text"] === "string" ? event["text"] : "";
      emitDelta(w, "text_delta", index, { text });
      return;
    }
    case "thinking_delta": {
      const index = typeof event["index"] === "number" ? event["index"] : 0;
      const thinking = typeof event["thinking"] === "string" ? event["thinking"] : "";
      emitDelta(w, "thinking_delta", index, { thinking });
      return;
    }
    case "signature_delta": {
      const index = typeof event["index"] === "number" ? event["index"] : 0;
      const signature = typeof event["signature"] === "string" ? event["signature"] : "";
      emitDelta(w, "signature_delta", index, { signature });
      return;
    }
    case "input_json_delta": {
      const index = typeof event["index"] === "number" ? event["index"] : 0;
      const partialJson = typeof event["partial_json"] === "string" ? event["partial_json"] : "";
      emitDelta(w, "input_json_delta", index, { partial_json: partialJson });
      return;
    }
    case "content_block_stop": {
      const index = typeof event["index"] === "number" ? event["index"] : 0;
      emitContentBlockStop(w, index);
      return;
    }
    case "message_delta": {
      const delta = (event["delta"] as Record<string, unknown>) ?? {};
      const raw = delta["stop_reason"];
      // Only a legal Anthropic stop reason may reach the client. Anything else
      // — absent, non-string, or the collector's internal "StreamError" marker
      // — becomes null. Fabricating "end_turn" here made a failed or truncated
      // stream look like a clean end of turn.
      const stopReason =
        typeof raw === "string" && ANTHROPIC_STOP_REASONS.has(raw) ? raw : null;
      // Forward the collector's usage object unchanged so input_tokens and the
      // cache_* fields survive to the client.
      const usage = (event["usage"] as Partial<Usage> | undefined) ?? {};
      emitMessageDelta(w, stopReason, usage);
      return;
    }
    case "message_stop": {
      emitMessageStop(w);
      return;
    }
    default:
      // Unknown event types are ignored — forward only the Anthropic-shaped
      // streaming events the client expects.
      return;
  }
}

/**
 * Stream an Anthropic-shaped Messages response.
 *
 * Builds a `ReadableStream` whose `start` callback runs `generate` with an
 * `emit` that forwards each collector event to the stream as an SSE frame.
 * Returns a `Response` with `content-type: text/event-stream` and the stream
 * as its body; Bun streams the response chunk-by-chunk as frames are enqueued.
 *
 * On a generate failure, an `error` SSE frame (Anthropic-shaped) is written
 * before the stream closes so the client surfaces the failure inline rather
 * than seeing a truncated stream.
 *
 * **Terminal frames are provisional.** `message_delta` and `message_stop`
 * assert that the message ended successfully, but the collector emits them
 * before `generate` has decided whether the stream failed (an upstream
 * `response.failed` emits them and *then* rejects). Writing them straight
 * through put `message_stop` on the wire ahead of the `error` frame — and per
 * the Anthropic streaming contract `message_stop` terminates the message, so
 * conforming clients ignore anything after it and render a truncated response
 * as if it had completed normally. They are therefore buffered and flushed
 * only once `generate` resolves; on rejection they are discarded and only the
 * `error` frame is written. Non-terminal events (text deltas in particular)
 * are still forwarded the instant they arrive, so streaming latency is
 * unchanged.
 */
export async function streamMessages(
  opts: StreamMessagesOptions,
  generate: GenerateFn,
  tracker?: StreamStatsTracker,
): Promise<Response> {
  const { req, cred, model, defaultEffort, maxConcurrent, signal, generateDeps } = opts;
  // The requested public model id (e.g. `claude-luca-code-gpt-5`) — used for the
  // `message_start.model` field so the client sees the model it asked for,
  // matching macaz `streamMessages` (server.go:286).
  const requestedModel = req.model;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const writer = createSSEWriter(controller);
      // Held-back terminal events, in arrival order. Flushed on success,
      // discarded on failure.
      const pendingTerminals: { type: string; [k: string]: unknown }[] = [];
      const emit: EmitFunc = (event) => {
        const ev = event as { type: string; [k: string]: unknown };
        if (TERMINAL_EVENTS.has(ev.type)) {
          pendingTerminals.push(ev);
          return;
        }
        forwardEvent(writer, ev, requestedModel);
      };
      try {
        const result = await generate(
          {
            req,
            emit,
            cred,
            model,
            defaultEffort,
            maxConcurrent,
          },
          { ...(generateDeps ?? {}), signal },
        );
        // Book the result BEFORE flushing. The upstream call already succeeded
        // and its tokens were really spent; whether the client is still
        // listening must not convert that into a recorded failure with zero
        // usage. Flushing first would let `controller.enqueue` on a cancelled
        // stream throw into the catch below and take the accounting with it.
        tracker?.recordResult(result);
        // Same "the client may be gone" hazard as the error frame and the
        // close() below: writing to a cancelled controller throws.
        try {
          for (const ev of pendingTerminals) forwardEvent(writer, ev, requestedModel);
        } catch {
          // client is gone — the terminators have nowhere to go
        }
      } catch (err) {
        // Discard the buffered success terminators — a failed stream must
        // never carry message_delta / message_stop.
        pendingTerminals.length = 0;
        tracker?.recordFailure();
        let message = err instanceof Error ? err.message : "upstream generate failed";
        // Surface OpenAI's actual rejection body in the error frame so the
        // client sees the upstream 400 reason instead of just "upstream 400".
        const body = (err as { body?: string }).body;
        if (typeof body === "string" && body.length > 0) {
          message = `${message} — ${body.slice(0, 512)}`;
        }
        // Writing to an already-cancelled stream (the client disconnected)
        // throws; swallow it so the failure does not escape `start` as an
        // unhandled rejection.
        try {
          writer.write("error", {
            type: "error",
            error: { type: "api_error", message },
          });
        } catch {
          // client is gone — nothing to report to
        }
      } finally {
        // Same reasoning: closing an already-cancelled controller throws.
        try {
          controller.close();
        } catch {
          // already closed / cancelled
        }
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
}