import { test, expect, describe } from "bun:test";
import { writeSSE, readSSE, type SSEHandler, type SSESource } from "../src/sse";
import {
  Effort,
  IsCompactionRequest,
  effortRank,
  ServiceTier,
  EstimateInputTokens,
  type Effort as EffortLevel,
} from "../src/effort";
import type { Request, Message } from "../src/protocol/types";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Build a ReadableStream<Uint8Array> from a string. */
function sseStream(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

/** Collect all dispatched SSE events into an array. */
async function collect(source: SSESource): Promise<Array<{ event: string; data: string }>> {
  const out: Array<{ event: string; data: string }> = [];
  const handler: SSEHandler = (event, data) => {
    out.push({ event, data });
  };
  await readSSE(source, handler);
  return out;
}

/** Construct a minimal Request with overrides. */
function makeRequest(over: Partial<Request> = {}): Request {
  return {
    model: "claude-test",
    max_tokens: 1024,
    messages: [],
    system: "",
    tools: [],
    tool_choice: null,
    stop_sequences: [],
    stream: false,
    thinking: undefined,
    output_config: undefined,
    output_format: undefined,
    metadata: undefined,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// writeSSE
// ---------------------------------------------------------------------------

describe("writeSSE", () => {
  test("produces the canonical event+data framing terminated by a blank line", () => {
    const out = writeSSE("ping", { hello: "world" });
    expect(out).toBe('event: ping\ndata: {"hello":"world"}\n\n');
  });

  test("JSON-stringifies arbitrary values", () => {
    expect(writeSSE("done", null)).toBe("event: done\ndata: null\n\n");
    expect(writeSSE("num", 42)).toBe("event: num\ndata: 42\n\n");
  });

  test("preserves multi-word event names", () => {
    expect(writeSSE("content_block_delta", { x: 1 })).toBe(
      'event: content_block_delta\ndata: {"x":1}\n\n',
    );
  });
});

// ---------------------------------------------------------------------------
// readSSE
// ---------------------------------------------------------------------------

describe("readSSE", () => {
  test("dispatches a single event on the trailing blank line", async () => {
    const events = await collect(
      sseStream("event: ping\ndata: hello\n\n"),
    );
    expect(events).toEqual([{ event: "ping", data: "hello" }]);
  });

  test("joins multi-line data fields with newlines", async () => {
    const events = await collect(
      sseStream("event: msg\ndata: line1\ndata: line2\ndata: line3\n\n"),
    );
    expect(events).toHaveLength(1);
    const first = events[0]!;
    expect(first.event).toBe("msg");
    expect(first.data).toBe("line1\nline2\nline3");
  });

  test("skips comment lines starting with a colon", async () => {
    const events = await collect(
      sseStream(": this is a comment\nevent: ping\ndata: hello\n\n"),
    );
    expect(events).toEqual([{ event: "ping", data: "hello" }]);
  });

  test("dispatches multiple events in sequence", async () => {
    const src =
      "event: a\ndata: a-data\n\n" +
      "event: b\ndata: b-data\n\n" +
      "event: c\ndata: c1\ndata: c2\n\n";
    const events = await collect(sseStream(src));
    expect(events).toEqual([
      { event: "a", data: "a-data" },
      { event: "b", data: "b-data" },
      { event: "c", data: "c1\nc2" },
    ]);
  });

  test("does not dispatch until a blank line is seen", async () => {
    // No trailing blank line => pending event is NOT dispatched.
    const events = await collect(sseStream("event: pending\ndata: x"));
    expect(events).toEqual([]);
  });

  test("ignores unknown fields (id, retry)", async () => {
    const events = await collect(
      sseStream("id: 1\nretry: 500\nevent: ping\ndata: hi\n\n"),
    );
    expect(events).toEqual([{ event: "ping", data: "hi" }]);
  });

  test("handles data field with no leading space after the colon", async () => {
    const events = await collect(sseStream("event: ping\ndata:no-space\n\n"));
    expect(events).toEqual([{ event: "ping", data: "no-space" }]);
  });

  test("handles CRLF line endings", async () => {
    const events = await collect(
      sseStream("event: ping\r\ndata: hello\r\n\r\n"),
    );
    expect(events).toEqual([{ event: "ping", data: "hello" }]);
  });

  test("awaits an async handler before reading the next chunk", async () => {
    const order: string[] = [];
    const events: Array<{ event: string; data: string }> = [];
    const handler: SSEHandler = async (event, data) => {
      await new Promise<void>((r) => setTimeout(r, 5));
      events.push({ event, data });
      order.push(`fn:${event}`);
    };
    await readSSE(
      sseStream("event: a\ndata: 1\n\nevent: b\ndata: 2\n\n"),
      handler,
    );
    expect(events).toEqual([
      { event: "a", data: "1" },
      { event: "b", data: "2" },
    ]);
    // Handlers ran in order (serialized).
    expect(order).toEqual(["fn:a", "fn:b"]);
  });

  test("accepts a Bun file-like source (Blob.stream())", async () => {
    // A Blob mirrors BunFile's .stream() interface; readSSE must accept it.
    const blob = new Blob(["event: ping\ndata: blob\n\n"]);
    const events = await collect(blob as unknown as SSESource);
    expect(events).toEqual([{ event: "ping", data: "blob" }]);
  });
});

// ---------------------------------------------------------------------------
// effort — Effort()
// ---------------------------------------------------------------------------

describe("Effort budget buckets", () => {
  test(">=64000 maps to max", () => {
    expect(Effort(makeRequest({ thinking: { type: "enabled", budget_tokens: 64000 } }), "medium")).toBe("max");
    expect(Effort(makeRequest({ thinking: { type: "enabled", budget_tokens: 100000 } }), "medium")).toBe("max");
  });

  test(">=32000 (and <64000) maps to xhigh", () => {
    expect(Effort(makeRequest({ thinking: { type: "enabled", budget_tokens: 32000 } }), "medium")).toBe("xhigh");
    expect(Effort(makeRequest({ thinking: { type: "enabled", budget_tokens: 63999 } }), "medium")).toBe("xhigh");
  });

  test(">=16000 (and <32000) maps to high", () => {
    expect(Effort(makeRequest({ thinking: { type: "enabled", budget_tokens: 16000 } }), "medium")).toBe("high");
    expect(Effort(makeRequest({ thinking: { type: "enabled", budget_tokens: 31999 } }), "medium")).toBe("high");
  });

  test(">=4000 (and <16000) maps to medium", () => {
    expect(Effort(makeRequest({ thinking: { type: "enabled", budget_tokens: 4000 } }), "low")).toBe("medium");
    expect(Effort(makeRequest({ thinking: { type: "enabled", budget_tokens: 15999 } }), "low")).toBe("medium");
  });

  test(">0 (and <4000) maps to low", () => {
    expect(Effort(makeRequest({ thinking: { type: "enabled", budget_tokens: 1 } }), "high")).toBe("low");
    expect(Effort(makeRequest({ thinking: { type: "enabled", budget_tokens: 3999 } }), "high")).toBe("low");
  });

  test("adaptive thinking falls back to the fallback effort", () => {
    expect(Effort(makeRequest({ thinking: { type: "adaptive", budget_tokens: 64000 } }), "high")).toBe("high");
  });

  test("missing thinking falls back", () => {
    expect(Effort(makeRequest({ thinking: undefined }), "medium")).toBe("medium");
  });

  test("non-numeric / zero budget falls back", () => {
    expect(Effort(makeRequest({ thinking: { type: "enabled", budget_tokens: 0 } }), "medium")).toBe("medium");
    expect(Effort(makeRequest({ thinking: { type: "enabled" } }), "low")).toBe("low");
  });
});

describe("Effort compaction clamp", () => {
  const compactionSystem =
    "You are tasked with summarizing conversations for context compaction.";

  test("compaction requests are clamped to low even with a huge budget", () => {
    const req = makeRequest({
      system: compactionSystem,
      thinking: { type: "enabled", budget_tokens: 64000 },
    });
    expect(Effort(req, "high")).toBe("low");
  });

  test("IsCompactionRequest detects the compaction marker", () => {
    expect(IsCompactionRequest(makeRequest({ system: compactionSystem }))).toBe(true);
    expect(IsCompactionRequest(makeRequest({ system: "normal assistant" }))).toBe(false);
  });

  test("IsCompactionRequest handles array system blocks", () => {
    const req = makeRequest({
      system: [{ type: "text", text: compactionSystem }],
    });
    expect(IsCompactionRequest(req)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// effortRank
// ---------------------------------------------------------------------------

describe("effortRank", () => {
  test("orders efforts monotonically low < medium < high < xhigh < max", () => {
    const ranks: Array<EffortLevel> = ["low", "medium", "high", "xhigh", "max"];
    for (let i = 1; i < ranks.length; i++) {
      expect(effortRank(ranks[i]!)).toBeGreaterThan(effortRank(ranks[i - 1]!));
    }
  });

  test("unknown effort ranks at the bottom (0)", () => {
    expect(effortRank("garbage" as EffortLevel)).toBe(0);
    expect(effortRank("low")).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// ServiceTier
// ---------------------------------------------------------------------------

describe("ServiceTier", () => {
  test("speed=fast maps to priority", () => {
    expect(ServiceTier(makeRequest({ speed: "fast" }))).toBe("priority");
  });

  test("other/missing speed maps to empty string", () => {
    expect(ServiceTier(makeRequest({ speed: "normal" }))).toBe("");
    expect(ServiceTier(makeRequest({}))).toBe("");
  });
});

// ---------------------------------------------------------------------------
// EstimateInputTokens
// ---------------------------------------------------------------------------

describe("EstimateInputTokens", () => {
  test("empty request estimates 0 tokens", () => {
    expect(EstimateInputTokens(makeRequest())).toBe(0);
  });

  test("pure text content: chars/4 (floor)", () => {
    // 40 chars -> 10 tokens
    const text = "a".repeat(40);
    const req = makeRequest({
      messages: [{ role: "user", content: text }],
    });
    expect(EstimateInputTokens(req)).toBe(10);
  });

  test("image block contributes a conservative 8000 chars (2000 tokens)", () => {
    const req = makeRequest({
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/png", data: "BASE64DATA" } },
          ] as unknown as Message["content"],
        },
      ],
    });
    expect(EstimateInputTokens(req)).toBe(2000);
  });

  test("base64 image data is excluded from the char count (only the 8k allowance)", () => {
    const small = makeRequest({
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/png", data: "x".repeat(1000) } },
          ] as unknown as Message["content"],
        },
      ],
    });
    const big = makeRequest({
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/png", data: "x".repeat(100000) } },
          ] as unknown as Message["content"],
        },
      ],
    });
    // Both images estimate the same — base64 data excluded.
    expect(EstimateInputTokens(small)).toBe(2000);
    expect(EstimateInputTokens(big)).toBe(2000);
  });

  test("mixes text + image: (text_chars + 8000) / 4", () => {
    const req = makeRequest({
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "a".repeat(40) },
            { type: "image", source: { type: "base64", media_type: "image/png", data: "data" } },
          ] as unknown as Message["content"],
        },
      ],
    });
    // (40 + 8000) / 4 = 2010
    expect(EstimateInputTokens(req)).toBe(2010);
  });

  test("system prompt contributes to the char count", () => {
    const req = makeRequest({
      system: "a".repeat(40),
      messages: [{ role: "user", content: "b".repeat(40) }],
    });
    // (40 + 40) / 4 = 20
    expect(EstimateInputTokens(req)).toBe(20);
  });

  test("tool_use input JSON is counted", () => {
    const req = makeRequest({
      messages: [
        {
          role: "user",
          content: [
            { type: "tool_use", id: "t1", name: "search", input: { query: "a".repeat(40) } },
          ] as unknown as Message["content"],
        },
      ],
    });
    // input JSON has at least 40 chars; estimate is floor(jsonlen/4)
    const est = EstimateInputTokens(req);
    expect(est).toBeGreaterThan(0);
  });
});