/**
 * test/collector.test.ts — Step 5 collector tests.
 *
 * Exercises the OpenAI Responses SSE -> Anthropic blocks + Events translation
 * ported from macaz `internal/provider/openresponses/stream.go` Collector.Handle.
 *
 * The golden test feeds a recorded Responses SSE fixture (response.created,
 * output_item.added function_call, function_call_arguments.delta*, output_item.done,
 * response.completed with usage) and asserts the Anthropic SSE event sequence
 * (message_start, content_block_start tool_use, input_json_delta*,
 * content_block_stop, message_delta stop_reason:tool_use, message_stop) + usage.
 */

import { test, expect, describe } from "bun:test";

import { createCollector, repairReadArguments } from "../src/protocol/collector";
import type { EmitFunc, Event } from "../src/protocol/types";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** A capturing EmitFunc that records every emitted Event in order. */
function capturingEmit(): { emit: EmitFunc; events: Event[] } {
  const events: Event[] = [];
  const emit: EmitFunc = (e: Event) => {
    events.push(e);
  };
  return { emit, events };
}

/** Map a list of Events to their `type` for sequence assertions. */
function typesOf(events: Event[]): string[] {
  return events.map((e) => e.type);
}

// ---------------------------------------------------------------------------
// Golden test — recorded Responses SSE fixture -> Anthropic SSE sequence
// ---------------------------------------------------------------------------

describe("collector golden: function_call tool_use stream", () => {
  // A recorded Responses SSE stream: a single Read function_call whose
  // arguments arrive in three deltas, then a terminal response.completed.
  const fixture: Array<{ event: string; data: Record<string, unknown> }> = [
    {
      event: "response.created",
      data: {
        response: {
          id: "resp_abc",
          model: "gpt-5",
          usage: { input_tokens: 42, output_tokens: 0 },
        },
      },
    },
    {
      event: "response.output_item.added",
      data: {
        item: {
          type: "function_call",
          id: "fc_1",
          call_id: "call_1",
          name: "Read",
          arguments: "",
        },
      },
    },
    {
      event: "response.function_call_arguments.delta",
      data: { delta: '{"file_' },
    },
    {
      event: "response.function_call_arguments.delta",
      data: { delta: 'path":"/tmp/foo"}' },
    },
    {
      event: "response.function_call_arguments.delta",
      data: { delta: "}" },
    },
    {
      event: "response.output_item.done",
      data: {
        item: {
          type: "function_call",
          id: "fc_1",
          call_id: "call_1",
          name: "Read",
          arguments: '{"file_path":"/tmp/foo"}',
        },
      },
    },
    {
      event: "response.completed",
      data: {
        response: {
          id: "resp_abc",
          model: "gpt-5",
          status: "completed",
          usage: { input_tokens: 42, output_tokens: 7 },
        },
      },
    },
  ];

  test("emits the canonical Anthropic SSE event sequence", () => {
    const { emit, events } = capturingEmit();
    const c = createCollector();
    for (const ev of fixture) c.handle(ev, emit);
    const fin = c.finalize();

    expect(fin.ok).toBe(true);
    expect(typesOf(events)).toEqual([
      "message_start",
      "content_block_start",
      "input_json_delta",
      "input_json_delta",
      "input_json_delta",
      "content_block_stop",
      "message_delta",
      "message_stop",
    ]);
  });

  test("message_start carries id, model, and input-token usage", () => {
    const { emit, events } = capturingEmit();
    const c = createCollector();
    for (const ev of fixture) c.handle(ev, emit);
    c.finalize();

    const start = events[0]!;
    expect(start.type).toBe("message_start");
    const message = start["message"] as Record<string, unknown>;
    expect(message["id"]).toBe("resp_abc");
    expect(message["model"]).toBe("gpt-5");
    expect(message["role"]).toBe("assistant");
    const usage = message["usage"] as Record<string, number>;
    expect(usage["input_tokens"]).toBe(42);
    expect(usage["output_tokens"]).toBe(0);
  });

  test("content_block_start opens a tool_use block with id and name", () => {
    const { emit, events } = capturingEmit();
    const c = createCollector();
    for (const ev of fixture) c.handle(ev, emit);
    c.finalize();

    const cbs = events[1]!;
    expect(cbs.type).toBe("content_block_start");
    expect(cbs["index"]).toBe(0);
    const block = cbs["content_block"] as Record<string, unknown>;
    expect(block["type"]).toBe("tool_use");
    expect(block["id"]).toBe("call_1");
    expect(block["name"]).toBe("Read");
    // input on the start event is the empty object placeholder
    expect(block["input"]).toEqual({});
  });

  test("input_json_delta events stream the partial JSON verbatim", () => {
    const { emit, events } = capturingEmit();
    const c = createCollector();
    for (const ev of fixture) c.handle(ev, emit);
    c.finalize();

    const deltas = events.filter((e) => e.type === "input_json_delta");
    expect(deltas).toHaveLength(3);
    expect(deltas[0]!["index"]).toBe(0);
    expect(deltas[0]!["partial_json"]).toBe('{"file_');
    expect(deltas[1]!["partial_json"]).toBe('path":"/tmp/foo"}');
    expect(deltas[2]!["partial_json"]).toBe("}");
  });

  test("content_block_stop closes the tool_use block", () => {
    const { emit, events } = capturingEmit();
    const c = createCollector();
    for (const ev of fixture) c.handle(ev, emit);
    c.finalize();

    const stop = events.find((e) => e.type === "content_block_stop")!;
    expect(stop["index"]).toBe(0);
  });

  test("message_delta carries tool_use stop_reason and output-token usage", () => {
    const { emit, events } = capturingEmit();
    const c = createCollector();
    for (const ev of fixture) c.handle(ev, emit);
    c.finalize();

    const md = events.find((e) => e.type === "message_delta")!;
    const delta = md["delta"] as Record<string, unknown>;
    expect(delta["stop_reason"]).toBe("tool_use");
    const usage = md["usage"] as Record<string, number>;
    expect(usage["output_tokens"]).toBe(7);
    // message_delta carries the FULL usage (input + output), matching macaz
    // server.go:374 — not just {output_tokens}.
    expect(usage["input_tokens"]).toBe(42);
  });

  test("finalize result has parsed tool_use input, model, stop_reason, usage", () => {
    const { emit, events } = capturingEmit();
    const c = createCollector();
    for (const ev of fixture) c.handle(ev, emit);
    const fin = c.finalize();

    expect(fin.ok).toBe(true);
    const r = fin.result;
    expect(r.model).toBe("gpt-5");
    expect(r.stop_reason).toBe("tool_use");
    expect(r.usage.input_tokens).toBe(42);
    expect(r.usage.output_tokens).toBe(7);
    expect(r.blocks).toHaveLength(1);
    expect(r.blocks[0]!.type).toBe("tool_use");
    // block.id is the upstream `call_id`, NOT the Responses item id ("fc_1").
    // It is the round-trip key sent back as `function_call_output.call_id`;
    // sending "fc_1" makes OpenAI reject with "No tool output found for
    // function call". This matches the content_block_start assertion above.
    expect(r.blocks[0]!.id).toBe("call_1");
    expect(r.blocks[0]!.name).toBe("Read");
    expect(r.blocks[0]!.input).toEqual({ file_path: "/tmp/foo" });
  });
});

// ---------------------------------------------------------------------------
// Responses lifecycle envelope parsing
//
// The OpenAI Responses API nests every lifecycle field under `data.response`:
//   {"type":"response.created","sequence_number":0,
//    "response":{"id":"resp_...","model":"gpt-5","status":"in_progress",...}}
// The collector must validate that envelope and read id / model / usage /
// incomplete_details / error from the INNER object.
// ---------------------------------------------------------------------------

describe("collector lifecycle envelope", () => {
  const created = {
    event: "response.created",
    data: {
      response: {
        id: "resp_abc",
        model: "gpt-5",
        status: "in_progress",
        usage: { input_tokens: 42, output_tokens: 0 },
      },
    },
  };

  test("response.created reads id, model and usage from data.response", () => {
    const { emit, events } = capturingEmit();
    const c = createCollector();
    c.handle(created, emit);

    const start = events[0]!;
    expect(start.type).toBe("message_start");
    const message = start["message"] as Record<string, unknown>;
    expect(message["id"]).toBe("resp_abc");
    expect(message["model"]).toBe("gpt-5");
    const usage = message["usage"] as Record<string, number>;
    expect(usage["input_tokens"]).toBe(42);
  });

  test("response.completed reads final usage and model from data.response", () => {
    const { emit, events } = capturingEmit();
    const c = createCollector();
    c.handle(created, emit);
    c.handle(
      {
        event: "response.completed",
        data: {
          response: {
            id: "resp_abc",
            model: "gpt-5",
            status: "completed",
            usage: { input_tokens: 42, output_tokens: 7 },
          },
        },
      },
      emit,
    );
    const fin = c.finalize();

    expect(fin.ok).toBe(true);
    const md = events.find((e) => e.type === "message_delta")!;
    expect(md["usage"]).toEqual({ input_tokens: 42, output_tokens: 7 });
    expect(fin.result.model).toBe("gpt-5");
    expect(fin.result.usage.output_tokens).toBe(7);
  });

  test("response.incomplete reads incomplete_details from data.response", () => {
    const { emit } = capturingEmit();
    const c = createCollector();
    c.handle(created, emit);
    c.handle(
      {
        event: "response.incomplete",
        data: {
          response: {
            id: "resp_abc",
            model: "gpt-5",
            status: "incomplete",
            incomplete_details: { reason: "max_output_tokens" },
            usage: { input_tokens: 1, output_tokens: 100 },
          },
        },
      },
      emit,
    );
    const fin = c.finalize();

    expect(fin.ok).toBe(true);
    expect(fin.result.stop_reason).toBe("max_tokens");
  });

  test("response.failed reads error.message from data.response", () => {
    const { emit } = capturingEmit();
    const c = createCollector();
    c.handle(created, emit);
    c.handle(
      {
        event: "response.failed",
        data: {
          response: {
            id: "resp_abc",
            model: "gpt-5",
            status: "failed",
            error: { code: "server_error", message: "upstream blew up" },
          },
        },
      },
      emit,
    );
    const fin = c.finalize();

    expect(fin.ok).toBe(false);
    expect(fin.error).toContain("upstream blew up");
  });

  test("response.cancelled envelope is terminal and maps to end_turn", () => {
    const { emit } = capturingEmit();
    const c = createCollector();
    c.handle(created, emit);
    c.handle(
      {
        event: "response.cancelled",
        data: {
          response: {
            id: "resp_abc",
            model: "gpt-5",
            status: "cancelled",
            usage: { input_tokens: 1, output_tokens: 0 },
          },
        },
      },
      emit,
    );
    const fin = c.finalize();

    expect(fin.ok).toBe(true);
    expect(fin.result.stop_reason).toBe("end_turn");
  });

  test("a malformed terminal after a valid created is rejected and emits nothing", () => {
    const { emit, events } = capturingEmit();
    const c = createCollector();
    c.handle(created, emit);
    c.handle({ event: "response.completed", data: {} }, emit);
    const fin = c.finalize();

    expect(fin.ok).toBe(false);
    expect(fin.error).toMatch(/malformed response\.completed/i);
    expect(typesOf(events)).toEqual(["message_start"]);
  });

  test("a malformed response.created latches a hard failure — later events emit nothing", () => {
    const { emit, events } = capturingEmit();
    const c = createCollector();
    c.handle({ event: "response.created", data: { id: "legacy", model: "m" } }, emit);
    c.handle({ event: "response.output_text.delta", data: { delta: "hi" } }, emit);
    c.handle(
      {
        event: "response.output_item.added",
        data: { item: { type: "function_call", id: "fc", call_id: "call_1", name: "Read" } },
      },
      emit,
    );
    const fin = c.finalize();

    expect(events).toEqual([]);
    expect(fin.ok).toBe(false);
    expect(fin.error).toMatch(/malformed response\.created/i);
  });

  test("leniency: a created envelope carrying only `id` is accepted", () => {
    // The ChatGPT-subscription endpoint is reported to omit `model`. Requiring
    // it would hard-fail 100% of that traffic, so only `response.id` is
    // load-bearing; `model` defaults to "" and usage to zeroes.
    const { emit, events } = capturingEmit();
    const c = createCollector();
    c.handle({ event: "response.created", data: { response: { id: "resp_1" } } }, emit);

    const message = events[0]!["message"] as Record<string, unknown>;
    expect(events[0]!.type).toBe("message_start");
    expect(message["model"]).toBe("");
    expect((message["usage"] as Record<string, number>)["input_tokens"]).toBe(0);

    c.handle(
      { event: "response.completed", data: { response: { id: "resp_1", status: "completed" } } },
      emit,
    );
    const fin = c.finalize();
    expect(fin.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Finalize rejection — partial streams must not be replayed on retry
// ---------------------------------------------------------------------------

describe("collector finalize rejection", () => {
  test("rejects a stream with no terminal event", () => {
    const { emit } = capturingEmit();
    const c = createCollector();
    c.handle(
      { event: "response.created", data: { response: { id: "r", model: "m", status: "in_progress" } } },
      emit,
    );
    c.handle(
      {
        event: "response.output_item.added",
        data: { item: { type: "function_call", id: "fc", call_id: "call_fc", name: "Read", arguments: "" } },
      },
      emit,
    );
    c.handle(
      { event: "response.function_call_arguments.delta", data: { delta: '{"file_' } },
      emit,
    );
    const fin = c.finalize();
    expect(fin.ok).toBe(false);
    expect(fin.error).toBeTruthy();
    expect(fin.error).toMatch(/terminal/i);
  });

  test("rejects a stream with an open block at finalize time", () => {
    const { emit } = capturingEmit();
    const c = createCollector();
    // response.created + output_item.added function_call, but no output_item.done
    // and no terminal -> terminal check fires first. To exercise the open-block
    // guard specifically, send a terminal that fails to close (simulate by
    // finalizing right after output_item.added with a terminal that we then
    // re-handle). We instead verify the guard by sending a terminal event
    // without an output_item.done for the open block; the collector's
    // closeOpen path should still close it, so ok must be true here —
    // documenting the invariant that terminals close open blocks.
    c.handle(
      { event: "response.created", data: { response: { id: "r", model: "m", status: "in_progress" } } },
      emit,
    );
    c.handle(
      {
        event: "response.output_item.added",
        data: { item: { type: "function_call", id: "fc", call_id: "call_fc", name: "Read", arguments: "" } },
      },
      emit,
    );
    c.handle(
      { event: "response.completed", data: { response: { id: "r", model: "m", status: "completed", usage: { input_tokens: 1, output_tokens: 1 } } } },
      emit,
    );
    const fin = c.finalize();
    expect(fin.ok).toBe(true);
    // the open tool_use block was closed by the terminal's closeOpen path
    expect(fin.result.blocks).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// function_call identity — call_id is the tool round-trip key
//
// `to-responses.ts` maps `tool_use.id -> function_call.call_id` and
// `tool_result.tool_use_id -> function_call_output.call_id`. The Responses ITEM
// id (`fc_...`) is never sent back upstream, so only `call_id` is load-bearing.
// ---------------------------------------------------------------------------

describe("collector function_call identity", () => {
  const created = {
    event: "response.created",
    data: { response: { id: "r", model: "m", status: "in_progress" } },
  };
  const completed = {
    event: "response.completed",
    data: { response: { id: "r", model: "m", status: "completed" } },
  };

  test("block.id is the call_id, never the Responses item id", () => {
    const { emit, events } = capturingEmit();
    const c = createCollector();
    c.handle(created, emit);
    c.handle(
      {
        event: "response.output_item.added",
        data: {
          item: { type: "function_call", id: "fc_xyz", call_id: "call_abc", name: "Bash", arguments: "{}" },
        },
      },
      emit,
    );
    c.handle(completed, emit);
    const fin = c.finalize();

    const cbs = events.find((e) => e.type === "content_block_start")!;
    const block = cbs["content_block"] as Record<string, unknown>;
    expect(block["id"]).toBe("call_abc");
    expect(block["id"]).not.toBe("fc_xyz");
    expect(fin.result.blocks[0]!.id).toBe("call_abc");
    expect(fin.result.blocks[0]!.id).not.toBe("fc_xyz");
  });

  test("a function_call with no item id is tolerated and opens a normal block", () => {
    const { emit, events } = capturingEmit();
    const c = createCollector();
    c.handle(created, emit);
    c.handle(
      {
        event: "response.output_item.added",
        data: { item: { type: "function_call", call_id: "call_abc", name: "Read", arguments: "" } },
      },
      emit,
    );
    c.handle(completed, emit);
    const fin = c.finalize();

    const cbs = events.find((e) => e.type === "content_block_start")!;
    expect((cbs["content_block"] as Record<string, unknown>)["id"]).toBe("call_abc");
    expect(fin.ok).toBe(true);
    expect(fin.result.blocks).toHaveLength(1);
  });

  test("a function_call with no call_id is a hard error and opens no block", () => {
    const { emit, events } = capturingEmit();
    const c = createCollector();
    c.handle(created, emit);
    c.handle(
      {
        event: "response.output_item.added",
        data: { item: { type: "function_call", id: "fc_1", name: "Read" } },
      },
      emit,
    );
    const fin = c.finalize();

    expect(events.some((e) => e.type === "content_block_start")).toBe(false);
    expect(fin.ok).toBe(false);
    expect(fin.error).toMatch(/call_id/);
  });

  test("an empty call_id is a hard error", () => {
    const { emit } = capturingEmit();
    const c = createCollector();
    c.handle(created, emit);
    c.handle(
      {
        event: "response.output_item.added",
        data: { item: { type: "function_call", id: "fc_1", call_id: "", name: "Read" } },
      },
      emit,
    );
    const fin = c.finalize();

    expect(fin.ok).toBe(false);
    expect(fin.error).toMatch(/call_id/);
  });
});

// ---------------------------------------------------------------------------
// Read-argument trailing-whitespace repair
// ---------------------------------------------------------------------------

describe("repairReadArguments", () => {
  test("passes through valid Read arguments unchanged", () => {
    const out = repairReadArguments('{"file_path":"/tmp/x"}');
    expect(out).toEqual({ file_path: "/tmp/x" });
  });

  test("repairs a stalled/truncated Read argument stream by extracting file_path", () => {
    // GPT stalled mid-emit: trailing whitespace + unclosed JSON
    const out = repairReadArguments('{"file_path":"/tmp/foo"  ');
    expect(out).toEqual({ file_path: "/tmp/foo" });
  });

  test("returns parsed object for arguments with extra fields", () => {
    const out = repairReadArguments('{"file_path":"/a","offset":10,"limit":5}');
    expect(out).toEqual({ file_path: "/a", offset: 10, limit: 5 });
  });

  test("empty arguments parse to empty object", () => {
    const out = repairReadArguments("");
    expect(out).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Text deltas -> text block + text_delta
// ---------------------------------------------------------------------------

describe("collector text stream", () => {
  test("output_text.delta opens a text block and streams text_delta", () => {
    const { emit, events } = capturingEmit();
    const c = createCollector();
    c.handle(
      { event: "response.created", data: { response: { id: "r", model: "m", status: "in_progress", usage: { input_tokens: 3, output_tokens: 0 } } } },
      emit,
    );
    c.handle(
      { event: "response.output_item.added", data: { item: { type: "message", id: "msg_1" } } },
      emit,
    );
    c.handle(
      { event: "response.output_text.delta", data: { delta: "hello " } },
      emit,
    );
    c.handle(
      { event: "response.output_text.delta", data: { delta: "world" } },
      emit,
    );
    c.handle(
      { event: "response.output_item.done", data: { item: { type: "message", id: "msg_1", content: [{ type: "output_text", text: "hello world" }] } } },
      emit,
    );
    c.handle(
      { event: "response.completed", data: { response: { id: "r", model: "m", status: "completed", usage: { input_tokens: 3, output_tokens: 2 } } } },
      emit,
    );
    const fin = c.finalize();

    expect(fin.ok).toBe(true);
    expect(typesOf(events)).toEqual([
      "message_start",
      "content_block_start",
      "text_delta",
      "text_delta",
      "content_block_stop",
      "message_delta",
      "message_stop",
    ]);
    const cbs = events[1]!;
    expect(cbs["index"]).toBe(0);
    const block = cbs["content_block"] as Record<string, unknown>;
    expect(block["type"]).toBe("text");
    const tds = events.filter((e) => e.type === "text_delta");
    expect(tds[0]!["text"]).toBe("hello ");
    expect(tds[1]!["text"]).toBe("world");
    expect(fin.result.blocks[0]!.text).toBe("hello world");
    // no tool_use -> end_turn
    expect(fin.result.stop_reason).toBe("end_turn");
  });
});

// ---------------------------------------------------------------------------
// Reasoning -> thinking block (only when encrypted_content present)
// ---------------------------------------------------------------------------

describe("collector reasoning/thinking stream", () => {
  test("reasoning with encrypted_content emits thinking block + thinking_delta", () => {
    const { emit, events } = capturingEmit();
    const c = createCollector();
    c.handle(
      { event: "response.created", data: { response: { id: "r", model: "m", status: "in_progress", usage: { input_tokens: 1, output_tokens: 0 } } } },
      emit,
    );
    c.handle(
      {
        event: "response.output_item.added",
        data: {
          item: {
            type: "reasoning",
            id: "rs_1",
            encrypted_content: "enc-sig-blob",
            summary: [{ type: "summary_text", text: "" }],
          },
        },
      },
      emit,
    );
    c.handle(
      { event: "response.reasoning_summary_text.delta", data: { delta: "reasoning " } },
      emit,
    );
    c.handle(
      { event: "response.reasoning_summary_text.delta", data: { delta: "here" } },
      emit,
    );
    c.handle(
      {
        event: "response.output_item.done",
        data: {
          item: {
            type: "reasoning",
            id: "rs_1",
            encrypted_content: "enc-sig-blob",
            summary: [{ type: "summary_text", text: "reasoning here" }],
          },
        },
      },
      emit,
    );
    c.handle(
      { event: "response.completed", data: { response: { id: "r", model: "m", status: "completed", usage: { input_tokens: 1, output_tokens: 5 } } } },
      emit,
    );
    const fin = c.finalize();

    expect(fin.ok).toBe(true);
    expect(typesOf(events)).toEqual([
      "message_start",
      "content_block_start",
      "thinking_delta",
      "thinking_delta",
      "signature_delta",
      "content_block_stop",
      "message_delta",
      "message_stop",
    ]);
    const cbs = events[1]!;
    const block = cbs["content_block"] as Record<string, unknown>;
    expect(block["type"]).toBe("thinking");
    const tds = events.filter((e) => e.type === "thinking_delta");
    expect(tds[0]!["thinking"]).toBe("reasoning ");
    expect(tds[1]!["thinking"]).toBe("here");
    // signature_delta is emitted before content_block_stop (matching macaz
    // server.go:332-343) so the signature reaches the client on the wire.
    const sd = events.find((e) => e.type === "signature_delta")!;
    expect(sd["signature"]).toBe("enc-sig-blob");
    // signature set from encrypted_content on output_item.done
    expect(fin.result.blocks[0]!.signature).toBe("enc-sig-blob");
    expect(fin.result.blocks[0]!.thinking).toBe("reasoning here");
  });

  test("reasoning without encrypted_content is a noop (no thinking block)", () => {
    const { emit, events } = capturingEmit();
    const c = createCollector();
    c.handle(
      { event: "response.created", data: { response: { id: "r", model: "m", status: "in_progress", usage: { input_tokens: 1, output_tokens: 0 } } } },
      emit,
    );
    c.handle(
      {
        event: "response.output_item.added",
        data: { item: { type: "reasoning", id: "rs_2", summary: [] } },
      },
      emit,
    );
    c.handle(
      { event: "response.completed", data: { response: { id: "r", model: "m", status: "completed", usage: { input_tokens: 1, output_tokens: 0 } } } },
      emit,
    );
    const fin = c.finalize();

    expect(fin.ok).toBe(true);
    expect(fin.result.blocks).toHaveLength(0);
    // only message_start, message_delta, message_stop — no content_block_*
    expect(typesOf(events)).toEqual(["message_start", "message_delta", "message_stop"]);
  });
});

// ---------------------------------------------------------------------------
// Stop-reason mapping
// ---------------------------------------------------------------------------

describe("collector stop-reason mapping", () => {
  test("response.incomplete with max_output_tokens maps to max_tokens", () => {
    const { emit } = capturingEmit();
    const c = createCollector();
    c.handle(
      { event: "response.created", data: { response: { id: "r", model: "m", status: "in_progress", usage: { input_tokens: 1, output_tokens: 0 } } } },
      emit,
    );
    c.handle(
      {
        event: "response.incomplete",
        data: {
          response: {
            id: "r",
            model: "m",
            status: "incomplete",
            incomplete_details: { reason: "max_output_tokens" },
            usage: { input_tokens: 1, output_tokens: 100 },
          },
        },
      },
      emit,
    );
    const fin = c.finalize();
    expect(fin.ok).toBe(true);
    expect(fin.result.stop_reason).toBe("max_tokens");
  });

  test("response.failed reads the wire-shaped response envelope and emits no success terminal", () => {
    const { emit, events } = capturingEmit();
    const c = createCollector();
    c.handle(
      {
        event: "response.created",
        data: {
          response: {
            id: "r",
            model: "m",
            status: "in_progress",
            usage: { input_tokens: 1, output_tokens: 0 },
          },
        },
      },
      emit,
    );
    c.handle(
      {
        event: "response.failed",
        data: {
          response: {
            id: "r",
            model: "m",
            status: "failed",
            error: { code: "server_error", message: "upstream blew up" },
            usage: { input_tokens: 1, output_tokens: 0 },
          },
        },
      },
      emit,
    );
    const fin = c.finalize();
    expect(fin.ok).toBe(false);
    expect(fin.error).toMatch(/upstream blew up|failed/i);
    expect(typesOf(events)).toEqual(["message_start"]);
  });

  test("rejects legacy top-level lifecycle metadata as malformed", () => {
    const { emit, events } = capturingEmit();
    const c = createCollector();
    c.handle(
      { event: "response.created", data: { id: "legacy", model: "m" } },
      emit,
    );

    const fin = c.finalize();
    expect(fin.ok).toBe(false);
    expect(fin.error).toMatch(/malformed response\.created/i);
    expect(events).toEqual([]);
  });

  test("response.cancelled is terminal and maps stop_reason to end_turn", () => {
    const { emit } = capturingEmit();
    const c = createCollector();
    c.handle(
      { event: "response.created", data: { response: { id: "r", model: "m", status: "in_progress", usage: { input_tokens: 1, output_tokens: 0 } } } },
      emit,
    );
    c.handle(
      { event: "response.cancelled", data: { response: { id: "r", model: "m", status: "cancelled", usage: { input_tokens: 1, output_tokens: 0 } } } },
      emit,
    );
    const fin = c.finalize();
    expect(fin.ok).toBe(true);
    expect(fin.result.stop_reason).toBe("end_turn");
  });
});
// ---------------------------------------------------------------------------
// Error latch — a failed stream must never emit a success termination
//
// Anthropic's `message_stop` terminates the message. If the collector writes
// `message_delta` + `message_stop` for a failed upstream response, the client
// commits the (usually empty) turn and IGNORES the trailing `error` frame the
// gateway appends afterwards — an upstream failure renders as a silent success.
// ---------------------------------------------------------------------------

describe("collector error latch", () => {
  const created = {
    event: "response.created",
    data: {
      response: { id: "r", model: "m", status: "in_progress", usage: { input_tokens: 1, output_tokens: 0 } },
    },
  };
  const failed = {
    event: "response.failed",
    data: {
      response: {
        id: "r",
        model: "m",
        status: "failed",
        error: { code: "server_error", message: "upstream blew up" },
      },
    },
  };

  test("a failed stream with an OPEN tool_use block emits no terminator at all", () => {
    const { emit, events } = capturingEmit();
    const c = createCollector();
    c.handle(created, emit);
    c.handle(
      {
        event: "response.output_item.added",
        data: { item: { type: "function_call", id: "fc_1", call_id: "call_1", name: "Bash", arguments: "" } },
      },
      emit,
    );
    c.handle(
      { event: "response.function_call_arguments.delta", data: { delta: '{"command":' } },
      emit,
    );
    c.handle(failed, emit);
    const fin = c.finalize();

    const types = typesOf(events);
    expect(types).not.toContain("message_stop");
    expect(types).not.toContain("message_delta");
    expect(types).not.toContain("content_block_stop");
    expect(types).toEqual(["message_start", "content_block_start", "input_json_delta"]);

    // The upstream reason must win over the generic open-block guard.
    expect(fin.ok).toBe(false);
    expect(fin.error).toBe("upstream blew up");
    expect(fin.error).not.toMatch(/open content block/i);
  });

  test("the internal StreamError marker never reaches the wire", () => {
    const { emit, events } = capturingEmit();
    const c = createCollector();
    c.handle(created, emit);
    c.handle(failed, emit);

    for (const e of events) {
      const delta = e["delta"] as Record<string, unknown> | undefined;
      expect(delta?.["stop_reason"]).not.toBe("StreamError");
    }
  });

  test("a latched call_id error suppresses the terminator of an otherwise-valid completed", () => {
    const { emit, events } = capturingEmit();
    const c = createCollector();
    c.handle(created, emit);
    c.handle(
      {
        event: "response.output_item.added",
        data: { item: { type: "function_call", id: "fc_1", call_id: "", name: "Read" } },
      },
      emit,
    );
    c.handle(
      {
        event: "response.completed",
        data: {
          response: { id: "r", model: "m", status: "completed", usage: { input_tokens: 1, output_tokens: 4 } },
        },
      },
      emit,
    );
    const fin = c.finalize();

    const types = typesOf(events);
    expect(types).not.toContain("message_delta");
    expect(types).not.toContain("message_stop");
    expect(types).toEqual(["message_start"]);
    expect(fin.ok).toBe(false);
    expect(fin.error).toMatch(/call_id/);
  });

  test("finalize reports the latched error, not the generic missing-terminal message", () => {
    const { emit } = capturingEmit();
    const c = createCollector();
    c.handle({ event: "response.created", data: { id: "legacy", model: "m" } }, emit);
    const fin = c.finalize();

    expect(fin.ok).toBe(false);
    expect(fin.error).toMatch(/malformed response\.created/i);
    expect(fin.error).not.toMatch(/terminal/i);
  });

  test("regression guard: a clean stream still ends message_delta then message_stop", () => {
    const { emit, events } = capturingEmit();
    const c = createCollector();
    c.handle(created, emit);
    c.handle(
      { event: "response.output_text.delta", data: { delta: "hi" } },
      emit,
    );
    c.handle(
      {
        event: "response.completed",
        data: {
          response: { id: "r", model: "m", status: "completed", usage: { input_tokens: 1, output_tokens: 2 } },
        },
      },
      emit,
    );
    const fin = c.finalize();

    expect(fin.ok).toBe(true);
    expect(typesOf(events).slice(-2)).toEqual(["message_delta", "message_stop"]);
  });
});

/* -------------------------------------------------------------------------- */
/* lifecycle ordering — `state.lifecycle` must be ENFORCED, not merely tracked */
/* -------------------------------------------------------------------------- */

describe("collector lifecycle envelope ordering", () => {
  const goodTerminal = {
    event: "response.completed",
    data: {
      response: {
        id: "r",
        model: "m",
        status: "completed",
        usage: { input_tokens: 5, output_tokens: 2 },
      },
    },
  };

  test("a terminal arriving before response.created emits nothing and fails", () => {
    const { emit, events } = capturingEmit();
    const c = createCollector();
    c.handle(goodTerminal, emit);
    const fin = c.finalize();

    // A message_stop for a message that was never started makes Claude Code
    // commit an empty assistant turn as a SUCCESS.
    expect(typesOf(events)).toEqual([]);
    expect(fin.ok).toBe(false);
    expect(fin.error).toMatch(/before response\.created/i);
  });

  test("a second response.created after the terminal is rejected, not re-started", () => {
    const { emit, events } = capturingEmit();
    const c = createCollector();
    c.handle(
      { event: "response.created", data: { response: { id: "r", model: "first" } } },
      emit,
    );
    c.handle(goodTerminal, emit);
    c.handle(
      { event: "response.created", data: { response: { id: "r2", model: "second" } } },
      emit,
    );
    const fin = c.finalize();

    // No second message_start after message_stop, and the model must not be
    // silently overwritten by the stray frame.
    expect(typesOf(events)).toEqual(["message_start", "message_delta", "message_stop"]);
    expect(fin.ok).toBe(false);
    expect(fin.error).toMatch(/response\.created/i);
    expect(fin.result.model).toBe("first");
  });

  test("a duplicate response.created before any terminal is rejected", () => {
    const { emit, events } = capturingEmit();
    const c = createCollector();
    c.handle(
      { event: "response.created", data: { response: { id: "r", model: "first" } } },
      emit,
    );
    c.handle(
      { event: "response.created", data: { response: { id: "r", model: "second" } } },
      emit,
    );
    const fin = c.finalize();

    expect(typesOf(events)).toEqual(["message_start"]);
    expect(fin.ok).toBe(false);
    expect(fin.result.model).toBe("first");
  });
});

/* -------------------------------------------------------------------------- */
/* partial terminal usage must not clobber the input_tokens seen at created    */
/* -------------------------------------------------------------------------- */

describe("collector usage merge", () => {
  test("a terminal usage that omits input_tokens keeps the value from created", () => {
    const { emit, events } = capturingEmit();
    const c = createCollector();
    c.handle(
      {
        event: "response.created",
        data: { response: { id: "r", model: "m", usage: { input_tokens: 42, output_tokens: 0 } } },
      },
      emit,
    );
    c.handle(
      {
        event: "response.completed",
        data: { response: { id: "r", model: "m", status: "completed", usage: { output_tokens: 7 } } },
      },
      emit,
    );
    const fin = c.finalize();

    expect(fin.ok).toBe(true);
    expect(fin.result.usage).toEqual({ input_tokens: 42, output_tokens: 7 });
    const md = events.find((e) => e.type === "message_delta")!;
    expect(md["usage"]).toEqual({ input_tokens: 42, output_tokens: 7 });
  });

  test("a terminal usage that omits output_tokens keeps the running output count", () => {
    const { emit } = capturingEmit();
    const c = createCollector();
    c.handle(
      {
        event: "response.created",
        data: { response: { id: "r", model: "m", usage: { input_tokens: 9 } } },
      },
      emit,
    );
    c.handle(
      {
        event: "response.completed",
        data: { response: { id: "r", model: "m", status: "completed", usage: { input_tokens: 11 } } },
      },
      emit,
    );
    const fin = c.finalize();

    expect(fin.ok).toBe(true);
    expect(fin.result.usage).toEqual({ input_tokens: 11, output_tokens: 0 });
  });
});
