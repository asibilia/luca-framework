/**
 * to-responses.test.ts — step 4/18 golden + behavioral tests.
 *
 * Verifies the Anthropic Messages -> OpenAI Responses body translation
 * (macaz internal/protocol/openai.go ToResponses + responsesInput).
 */
import { test, expect } from "bun:test";
import { createHash } from "node:crypto";

import {
  ToResponses,
  newToolNames,
  effortFromBudget,
  type ResponsesBody,
  type ToResponsesResult,
} from "../src/protocol/to-responses";
import type { Request, Tool } from "../src/protocol/types";

// ---------------------------------------------------------------------------
// Helpers — build a fully-formed Anthropic Request with sane defaults.
// ---------------------------------------------------------------------------

function makeRequest(partial: Partial<Request> & Pick<Request, "messages">): Request {
  return {
    model: "claude-3-5-sonnet",
    max_tokens: 1024,
    system: "",
    tools: [],
    tool_choice: undefined,
    stop_sequences: [],
    stream: false,
    thinking: undefined,
    output_config: undefined,
    output_format: undefined,
    metadata: undefined,
    ...partial,
  };
}

function makeTool(partial: Partial<Tool> & Pick<Tool, "name">): Tool {
  return {
    type: "custom",
    description: "",
    input_schema: { type: "object", properties: {} },
    ...partial,
  };
}

/**
 * The exact wire string ToResponses synthesizes for a `function_call` that
 * never received a `function_call_output` (user interrupt / declined
 * permission). Written out literally here so the test pins the wire value
 * rather than whatever the implementation happens to export.
 */
const INTERRUPTED_OUTPUT = "[tool call was interrupted before it produced a result]";

// ---------------------------------------------------------------------------
// GOLDEN — multi-turn: user text + assistant tool_use + user tool_result + system
// ---------------------------------------------------------------------------

test("GOLDEN: multi-turn request -> exact Responses body shape", () => {
  const req = makeRequest({
    system: "you are helpful",
    messages: [
      { role: "user", content: "hi" },
      { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "ls", input: {} }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "done" }] },
    ],
    tools: [makeTool({ name: "ls", description: "list files" })],
    tool_choice: { type: "auto" },
    stream: false,
  });

  const result = ToResponses(req);

  const expectedBody: ResponsesBody = {
    model: "claude-3-5-sonnet",
    instructions: "you are helpful",
    input: [
      { type: "message", role: "user", content: [{ type: "input_text", text: "hi" }] },
      { type: "function_call", call_id: "t1", name: "ls", arguments: "{}" },
      { type: "function_call_output", call_id: "t1", output: "done" },
    ],
    tools: [
      {
        type: "function",
        name: "ls",
        description: "list files",
        parameters: { type: "object", properties: {} },
        strict: false,
      },
    ],
    tool_choice: "auto",
    parallel_tool_calls: false,
    store: false,
    stream: false,
  };

  expect(result.body).toEqual(expectedBody);
  expect(result.toolNames).toEqual(["ls"]);
});

// ---------------------------------------------------------------------------
// System -> instructions
// ---------------------------------------------------------------------------

test("system string -> top-level instructions", () => {
  const req = makeRequest({
    system: "be terse",
    messages: [{ role: "user", content: "hello" }],
  });
  expect(ToResponses(req).body.instructions).toBe("be terse");
});

test("system as array of text blocks -> joined instructions", () => {
  const req = makeRequest({
    system: [{ type: "text", text: "rule one" }, { type: "text", text: "rule two" }],
    messages: [{ role: "user", content: "hello" }],
  });
  expect(ToResponses(req).body.instructions).toBe("rule one\nrule two");
});

test("empty system -> empty string instructions", () => {
  const req = makeRequest({ messages: [{ role: "user", content: "hello" }] });
  expect(ToResponses(req).body.instructions).toBe("");
});

// ---------------------------------------------------------------------------
// Message / block translation
// ---------------------------------------------------------------------------

test("user text -> input_text message item", () => {
  const req = makeRequest({ messages: [{ role: "user", content: "ping" }] });
  const { input } = ToResponses(req).body;
  expect(input).toEqual([
    { type: "message", role: "user", content: [{ type: "input_text", text: "ping" }] },
  ]);
});

test("assistant text -> output_text message item", () => {
  const req = makeRequest({ messages: [{ role: "assistant", content: "pong" }] });
  const { input } = ToResponses(req).body;
  expect(input).toEqual([
    { type: "message", role: "assistant", content: [{ type: "output_text", text: "pong" }] },
  ]);
});

test("assistant thinking block (with signature) -> reasoning item with summary + encrypted_content", () => {
  // Regression: the Responses API requires `summary` on reasoning input
  // items; without it the upstream returns 400 "Missing required parameter:
  // 'input[N].summary'". The signed thinking blob maps to encrypted_content.
  const req = makeRequest({
    messages: [
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "let me consider", signature: "enc-blob" },
          { type: "text", text: "answer" },
        ],
      },
    ],
  });
  const { input } = ToResponses(req).body;
  expect(input).toEqual([
    {
      type: "reasoning",
      summary: [{ type: "summary_text", text: "let me consider" }],
      encrypted_content: "enc-blob",
    },
    { type: "message", role: "assistant", content: [{ type: "output_text", text: "answer" }] },
  ]);
});

test("assistant thinking block (no signature) -> reasoning item with summary, no encrypted_content", () => {
  // Plain thinking text must NOT be sent as encrypted_content (it is not
  // encrypted); only a real signature is.
  const req = makeRequest({
    messages: [
      {
        role: "assistant",
        content: [{ type: "thinking", thinking: "hmm" }],
      },
    ],
  });
  const reasoning = ToResponses(req).body.input.find((i) => i.type === "reasoning")!;
  expect(reasoning).toEqual({
    type: "reasoning",
    summary: [{ type: "summary_text", text: "hmm" }],
  });
  expect((reasoning as { encrypted_content?: string }).encrypted_content).toBeUndefined();
});

test("assistant text + tool_use -> message item then function_call item", () => {
  const req = makeRequest({
    tools: [makeTool({ name: "ls" })],
    messages: [
      {
        role: "assistant",
        content: [
          { type: "text", text: "running ls" },
          { type: "tool_use", id: "t9", name: "ls", input: { path: "/tmp" } },
        ],
      },
    ],
  });
  const { input } = ToResponses(req).body;
  expect(input).toEqual([
    { type: "message", role: "assistant", content: [{ type: "output_text", text: "running ls" }] },
    { type: "function_call", call_id: "t9", name: "ls", arguments: JSON.stringify({ path: "/tmp" }) },
    { type: "function_call_output", call_id: "t9", output: INTERRUPTED_OUTPUT },
  ]);
});

test("tool_use input default {} when missing -> arguments '{}'", () => {
  const req = makeRequest({
    tools: [makeTool({ name: "ls" })],
    messages: [
      { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "ls" }] },
    ],
  });
  const fc = ToResponses(req).body.input[0];
  expect(fc).toEqual({ type: "function_call", call_id: "t1", name: "ls", arguments: "{}" });
});

test("tool_result with string content -> function_call_output output string", () => {
  const req = makeRequest({
    tools: [makeTool({ name: "ls" })],
    messages: [
      { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "ls", input: {} }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "result text" }] },
    ],
  });
  const out = ToResponses(req).body.input.find((i) => i.type === "function_call_output");
  expect(out).toEqual({ type: "function_call_output", call_id: "t1", output: "result text" });
});

test("user tool_result followed by text preserves wire chronology", () => {
  const req = makeRequest({
    tools: [makeTool({ name: "ls" })],
    messages: [
      { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "ls", input: {} }] },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "t1", content: "first result" },
          { type: "text", text: "after result" },
        ],
      },
    ],
  });

  expect(ToResponses(req).body.input).toEqual([
    { type: "function_call", call_id: "t1", name: "ls", arguments: "{}" },
    { type: "function_call_output", call_id: "t1", output: "first result" },
    { type: "message", role: "user", content: [{ type: "input_text", text: "after result" }] },
  ]);
});

test("user text followed by tool_result preserves wire chronology", () => {
  const req = makeRequest({
    tools: [makeTool({ name: "ls" })],
    messages: [
      { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "ls", input: {} }] },
      {
        role: "user",
        content: [
          { type: "text", text: "before result" },
          { type: "tool_result", tool_use_id: "t1", content: "result" },
        ],
      },
    ],
  });

  expect(ToResponses(req).body.input).toEqual([
    { type: "function_call", call_id: "t1", name: "ls", arguments: "{}" },
    { type: "message", role: "user", content: [{ type: "input_text", text: "before result" }] },
    { type: "function_call_output", call_id: "t1", output: "result" },
  ]);
});

test("text and images between multiple tool results remain in contiguous segments", () => {
  const req = makeRequest({
    tools: [makeTool({ name: "ls" })],
    messages: [
      {
        role: "assistant",
        content: [
          { type: "tool_use", id: "t1", name: "ls", input: {} },
          { type: "tool_use", id: "t2", name: "ls", input: {} },
        ],
      },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "t1", content: "one" },
          { type: "text", text: "between" },
          { type: "image", source: { type: "url", url: "https://example.com/middle.png" } },
          { type: "tool_result", tool_use_id: "t2", content: "two" },
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "XYZ" } },
        ],
      },
    ],
  });

  expect(ToResponses(req).body.input).toEqual([
    { type: "function_call", call_id: "t1", name: "ls", arguments: "{}" },
    { type: "function_call", call_id: "t2", name: "ls", arguments: "{}" },
    { type: "function_call_output", call_id: "t1", output: "one" },
    {
      type: "message",
      role: "user",
      content: [
        { type: "input_text", text: "between" },
        { type: "input_image", image_url: "https://example.com/middle.png" },
      ],
    },
    { type: "function_call_output", call_id: "t2", output: "two" },
    {
      type: "message",
      role: "user",
      content: [{ type: "input_image", image_url: "data:image/jpeg;base64,XYZ" }],
    },
  ]);
});

test("adjacent tool results emit no empty message items", () => {
  const req = makeRequest({
    tools: [makeTool({ name: "ls" })],
    messages: [
      {
        role: "assistant",
        content: [
          { type: "tool_use", id: "t1", name: "ls", input: {} },
          { type: "tool_use", id: "t2", name: "ls", input: {} },
        ],
      },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "t1", content: "one" },
          { type: "tool_result", tool_use_id: "t2", content: "two" },
        ],
      },
    ],
  });

  expect(ToResponses(req).body.input).toEqual([
    { type: "function_call", call_id: "t1", name: "ls", arguments: "{}" },
    { type: "function_call", call_id: "t2", name: "ls", arguments: "{}" },
    { type: "function_call_output", call_id: "t1", output: "one" },
    { type: "function_call_output", call_id: "t2", output: "two" },
  ]);
  expect(ToResponses(req).body.input.some((item) => item.type === "message")).toBe(false);
});

test("image base64 block -> input_image with data URL", () => {
  const req = makeRequest({
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/png", data: "ABC123" },
          },
        ],
      },
    ],
  });
  const item = ToResponses(req).body.input[0];
  expect(item).toEqual({
    type: "message",
    role: "user",
    content: [{ type: "input_image", image_url: "data:image/png;base64,ABC123" }],
  });
});

test("image url block -> input_image with passthrough url", () => {
  const req = makeRequest({
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "url", url: "https://example.com/a.png" } },
        ],
      },
    ],
  });
  const item = ToResponses(req).body.input[0];
  expect(item).toEqual({
    type: "message",
    role: "user",
    content: [{ type: "input_image", image_url: "https://example.com/a.png" }],
  });
});

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

test("tools map to {type:function, name, description, parameters, strict:false}", () => {
  const req = makeRequest({
    tools: [makeTool({ name: "calc", description: "do math", input_schema: { type: "object" } })],
    messages: [{ role: "user", content: "hi" }],
  });
  expect(ToResponses(req).body.tools).toEqual([
    { type: "function", name: "calc", description: "do math", parameters: { type: "object" }, strict: false },
  ]);
});

test("parallel_tool_calls is always false", () => {
  const req = makeRequest({ messages: [{ role: "user", content: "hi" }] });
  expect(ToResponses(req).body.parallel_tool_calls).toBe(false);
});

test("store is always false", () => {
  const req = makeRequest({ messages: [{ role: "user", content: "hi" }] });
  expect(ToResponses(req).body.store).toBe(false);
});

// ---------------------------------------------------------------------------
// Server-side tool rejection
// ---------------------------------------------------------------------------

test("rejects bash_ server-side tool with a thrown Error", () => {
  const req = makeRequest({
    tools: [makeTool({ name: "bash_20241001" })],
    messages: [{ role: "user", content: "hi" }],
  });
  expect(() => ToResponses(req)).toThrow(/bash_/);
});

test("rejects web_search server-side tool", () => {
  const req = makeRequest({
    tools: [makeTool({ name: "web_search" })],
    messages: [{ role: "user", content: "hi" }],
  });
  expect(() => ToResponses(req)).toThrow(/web_search/);
});

test("rejects computer_, text_editor_, web_fetch, code_execution server-side tools", () => {
  for (const name of ["computer_20241001", "text_editor_20241001", "web_fetch", "code_execution"]) {
    const req = makeRequest({
      tools: [makeTool({ name })],
      messages: [{ role: "user", content: "hi" }],
    });
    expect(() => ToResponses(req)).toThrow();
  }
});

// ---------------------------------------------------------------------------
// tool_choice
// ---------------------------------------------------------------------------

test("tool_choice auto -> 'auto'", () => {
  const req = makeRequest({ tool_choice: { type: "auto" }, messages: [{ role: "user", content: "hi" }] });
  expect(ToResponses(req).body.tool_choice).toBe("auto");
});

test("tool_choice any -> 'required'", () => {
  const req = makeRequest({ tool_choice: { type: "any" }, messages: [{ role: "user", content: "hi" }] });
  expect(ToResponses(req).body.tool_choice).toBe("required");
});

test("tool_choice none -> 'none'", () => {
  const req = makeRequest({ tool_choice: { type: "none" }, messages: [{ role: "user", content: "hi" }] });
  expect(ToResponses(req).body.tool_choice).toBe("none");
});

test("tool_choice {type:tool,name} -> {type:function,name}", () => {
  const req = makeRequest({
    tools: [makeTool({ name: "ls" })],
    tool_choice: { type: "tool", name: "ls" },
    messages: [{ role: "user", content: "hi" }],
  });
  expect(ToResponses(req).body.tool_choice).toEqual({ type: "function", name: "ls" });
});

test("absent tool_choice -> no tool_choice field", () => {
  const req = makeRequest({ messages: [{ role: "user", content: "hi" }] });
  expect(ToResponses(req).body.tool_choice).toBeUndefined();
});

// ---------------------------------------------------------------------------
// sanitizeSubscription — dropped fields
// ---------------------------------------------------------------------------

test("max_output_tokens / user / truncation / previous_response_id are not emitted", () => {
  const req = makeRequest({ messages: [{ role: "user", content: "hi" }] });
  const body = ToResponses(req).body as unknown as Record<string, unknown>;
  expect(body).not.toHaveProperty("max_output_tokens");
  expect(body).not.toHaveProperty("user");
  expect(body).not.toHaveProperty("truncation");
  expect(body).not.toHaveProperty("previous_response_id");
});

// ---------------------------------------------------------------------------
// Reasoning from thinking budget
// ---------------------------------------------------------------------------

test("thinking budget_tokens sets reasoning {effort, summary:auto} + include", () => {
  const req = makeRequest({
    thinking: { type: "enabled", budget_tokens: 4096 },
    messages: [{ role: "user", content: "hi" }],
  });
  const body = ToResponses(req).body;
  expect(body.reasoning).toEqual({ effort: "low", summary: "auto" });
  expect(body.include).toEqual(["reasoning.encrypted_content"]);
});

test("effortFromBudget buckets: low / medium / high thresholds", () => {
  expect(effortFromBudget(2048)).toBe("low");
  expect(effortFromBudget(8192)).toBe("medium");
  expect(effortFromBudget(40000)).toBe("high");
});

test("no thinking -> no reasoning / no include", () => {
  const req = makeRequest({ messages: [{ role: "user", content: "hi" }] });
  const body = ToResponses(req).body;
  expect(body.reasoning).toBeUndefined();
  expect(body.include).toBeUndefined();
});

// ---------------------------------------------------------------------------
// NewToolNames — name normalization
// ---------------------------------------------------------------------------

test("newToolNames: valid names pass through unchanged", () => {
  const m = newToolNames(["ls", "calc_2", "mcp__foo_bar", "A"]);
  expect(m.get("ls")).toBe("ls");
  expect(m.get("calc_2")).toBe("calc_2");
  expect(m.get("mcp__foo_bar")).toBe("mcp__foo_bar");
  expect(m.get("A")).toBe("A");
});

test("newToolNames: invalid name (space) is sha256-prefixed to fit 64 chars", () => {
  const bad = "foo bar";
  const m = newToolNames([bad]);
  const normalized = m.get(bad)!;
  expect(normalized).toMatch(/^t_[0-9a-f]{62}$/);
  const expected = `t_${createHash("sha256").update(bad, "utf8").digest("hex").slice(0, 62)}`;
  expect(normalized).toBe(expected);
});

test("newToolNames: name longer than 64 chars is hashed", () => {
  const long = `${"a".repeat(65)}`;
  expect(long.length).toBe(65);
  const m = newToolNames([long]);
  const normalized = m.get(long)!;
  expect(normalized.length).toBeLessThanOrEqual(64);
  expect(normalized).toMatch(/^t_[0-9a-f]{62}$/);
});

test("newToolNames: different invalid names map to different normalized names", () => {
  const m = newToolNames(["foo bar", "baz qux"]);
  expect(m.get("foo bar")).not.toBe(m.get("baz qux"));
});

test("ToResponses applies normalized names to tools and function_call items", () => {
  const req = makeRequest({
    tools: [makeTool({ name: "foo bar", description: "d" })],
    messages: [
      { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "foo bar", input: {} }] },
    ],
  });
  const result = ToResponses(req);
  const expectedName = `t_${createHash("sha256").update("foo bar", "utf8").digest("hex").slice(0, 62)}`;
  expect(result.body.tools[0]!.name).toBe(expectedName);
  expect(result.toolNames).toEqual([expectedName]);
  const fc = result.body.input.find((i) => i.type === "function_call");
  expect(fc && (fc as { name: string }).name).toBe(expectedName);
});

// ---------------------------------------------------------------------------
// Stream passthrough
// ---------------------------------------------------------------------------

test("stream flag passes through", () => {
  const req = makeRequest({ stream: true, messages: [{ role: "user", content: "hi" }] });
  expect(ToResponses(req).body.stream).toBe(true);
});

// ---------------------------------------------------------------------------
// call_id reconciliation (todo #2) — the Responses API rejects any input[]
// whose function_call / function_call_output items do not pair up:
//   400 "No tool output found for function call <id>"
//   400 "No tool call found for function call output with call_id <id>"
// ---------------------------------------------------------------------------

test("orphan function_call gets a synthesized function_call_output", () => {
  // Claude Code's ESC-interrupt / declined-permission shape: the assistant turn
  // containing the tool_use survives in history, but the following user turn is
  // plain text instead of a tool_result.
  const req = makeRequest({
    tools: [makeTool({ name: "ls" })],
    messages: [
      { role: "user", content: "hi" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "running ls" },
          { type: "tool_use", id: "call_1", name: "ls", input: {} },
        ],
      },
      { role: "user", content: "[Request interrupted by user]" },
    ],
  });

  expect(ToResponses(req).body.input).toEqual([
    { type: "message", role: "user", content: [{ type: "input_text", text: "hi" }] },
    { type: "message", role: "assistant", content: [{ type: "output_text", text: "running ls" }] },
    { type: "function_call", call_id: "call_1", name: "ls", arguments: "{}" },
    { type: "function_call_output", call_id: "call_1", output: INTERRUPTED_OUTPUT },
    {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: "[Request interrupted by user]" }],
    },
  ]);
});

test("INVARIANT: every function_call call_id has a matching function_call_output", () => {
  const req = makeRequest({
    tools: [makeTool({ name: "ls" })],
    messages: [
      { role: "user", content: "hi" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "running ls" },
          { type: "tool_use", id: "call_1", name: "ls", input: {} },
        ],
      },
      { role: "user", content: "[Request interrupted by user]" },
    ],
  });

  const { input } = ToResponses(req).body;
  const calls = new Set(
    input.filter((i) => i.type === "function_call").map((i) => (i as { call_id: string }).call_id),
  );
  const outputs = new Set(
    input
      .filter((i) => i.type === "function_call_output")
      .map((i) => (i as { call_id: string }).call_id),
  );
  expect(calls.size).toBe(1);
  expect([...outputs].sort()).toEqual([...calls].sort());
});

test("trailing unanswered tool_use in the final message is still paired", () => {
  const req = makeRequest({
    tools: [makeTool({ name: "ls" })],
    messages: [
      { role: "assistant", content: [{ type: "tool_use", id: "call_7", name: "ls", input: {} }] },
    ],
  });

  const { input } = ToResponses(req).body;
  expect(input.length).toBe(2);
  expect(input[1]).toEqual({
    type: "function_call_output",
    call_id: "call_7",
    output: INTERRUPTED_OUTPUT,
  });
});

test("orphan function_call_output is not sent upstream but its payload survives", () => {
  // History truncation / auto-compaction can drop the assistant turn while
  // keeping the trailing tool_result.
  const req = makeRequest({
    messages: [
      { role: "user", content: [{ type: "tool_result", tool_use_id: "call_9", content: "stale output" }] },
      { role: "user", content: "continue" },
    ],
  });

  const { input } = ToResponses(req).body;
  expect(input.some((i) => i.type === "function_call_output")).toBe(false);
  const texts = input
    .filter((i) => i.type === "message")
    .flatMap((i) => (i as { content: Array<Record<string, unknown>> }).content)
    .filter((c) => c["type"] === "input_text")
    .map((c) => c["text"]);
  expect(texts).toContain("stale output");
});

test("a duplicate function_call_output for an already-answered call is dropped", () => {
  const req = makeRequest({
    tools: [makeTool({ name: "ls" })],
    messages: [
      { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "ls", input: {} }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "first" }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "second" }] },
    ],
  });

  const { input } = ToResponses(req).body;
  const outputs = input.filter((i) => i.type === "function_call_output");
  expect(outputs).toEqual([{ type: "function_call_output", call_id: "t1", output: "first" }]);
});

test("tool_use with no id never emits an empty call_id", () => {
  const req = makeRequest({
    tools: [makeTool({ name: "ls" })],
    messages: [{ role: "assistant", content: [{ type: "tool_use", name: "ls", input: {} }] }],
  });

  const fc = ToResponses(req).body.input.find((i) => i.type === "function_call") as {
    call_id: string;
  };
  expect(fc.call_id).not.toBe("");
  expect(fc.call_id.length).toBeGreaterThan(0);
  expect(fc.call_id).toBe("luca_code_call_0");
});

test("two id-less tool_use blocks get distinct non-empty call_ids", () => {
  const req = makeRequest({
    tools: [makeTool({ name: "ls" }), makeTool({ name: "cat" })],
    messages: [
      {
        role: "assistant",
        content: [
          { type: "tool_use", name: "ls", input: {} },
          { type: "tool_use", name: "cat", input: {} },
        ],
      },
    ],
  });

  const calls = ToResponses(req).body.input.filter((i) => i.type === "function_call") as Array<{
    call_id: string;
  }>;
  expect(calls.length).toBe(2);
  expect(calls[0]!.call_id).not.toBe("");
  expect(calls[1]!.call_id).not.toBe("");
  expect(calls[0]!.call_id).not.toBe(calls[1]!.call_id);
});

// ---------------------------------------------------------------------------
// Assistant-path mixed-content ordering (todo #9) — mirrors the user-path
// chronology tests above. With `reasoning.summary:"auto"` GPT-5 interleaves
// reasoning items between message and function_call items; the replay we send
// back must be the order the model produced.
// ---------------------------------------------------------------------------

test("assistant tool_use followed by text preserves wire chronology", () => {
  const req = makeRequest({
    tools: [makeTool({ name: "ls" })],
    messages: [
      {
        role: "assistant",
        content: [
          { type: "tool_use", id: "t1", name: "ls", input: {} },
          { type: "text", text: "done" },
        ],
      },
    ],
  });

  expect(ToResponses(req).body.input).toEqual([
    { type: "function_call", call_id: "t1", name: "ls", arguments: "{}" },
    { type: "function_call_output", call_id: "t1", output: INTERRUPTED_OUTPUT },
    { type: "message", role: "assistant", content: [{ type: "output_text", text: "done" }] },
  ]);
});

test("assistant text followed by thinking preserves wire chronology", () => {
  const req = makeRequest({
    messages: [
      {
        role: "assistant",
        content: [
          { type: "text", text: "answer" },
          { type: "thinking", thinking: "second thoughts", signature: "sig" },
        ],
      },
    ],
  });

  expect(ToResponses(req).body.input).toEqual([
    { type: "message", role: "assistant", content: [{ type: "output_text", text: "answer" }] },
    {
      type: "reasoning",
      summary: [{ type: "summary_text", text: "second thoughts" }],
      encrypted_content: "sig",
    },
  ]);
});

test("each assistant reasoning item stays adjacent to the item it precedes", () => {
  const req = makeRequest({
    tools: [makeTool({ name: "ls" })],
    messages: [
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "a", signature: "s1" },
          { type: "text", text: "mid" },
          { type: "thinking", thinking: "b", signature: "s2" },
          { type: "tool_use", id: "t2", name: "ls", input: {} },
        ],
      },
    ],
  });

  expect(ToResponses(req).body.input).toEqual([
    { type: "reasoning", summary: [{ type: "summary_text", text: "a" }], encrypted_content: "s1" },
    { type: "message", role: "assistant", content: [{ type: "output_text", text: "mid" }] },
    { type: "reasoning", summary: [{ type: "summary_text", text: "b" }], encrypted_content: "s2" },
    { type: "function_call", call_id: "t2", name: "ls", arguments: "{}" },
    { type: "function_call_output", call_id: "t2", output: INTERRUPTED_OUTPUT },
  ]);
});

test("assistant text runs split at a tool_use boundary instead of merging", () => {
  const req = makeRequest({
    tools: [makeTool({ name: "ls" })],
    messages: [
      {
        role: "assistant",
        content: [
          { type: "text", text: "before" },
          { type: "tool_use", id: "t3", name: "ls", input: {} },
          { type: "text", text: "after" },
        ],
      },
    ],
  });

  expect(ToResponses(req).body.input).toEqual([
    { type: "message", role: "assistant", content: [{ type: "output_text", text: "before" }] },
    { type: "function_call", call_id: "t3", name: "ls", arguments: "{}" },
    { type: "function_call_output", call_id: "t3", output: INTERRUPTED_OUTPUT },
    { type: "message", role: "assistant", content: [{ type: "output_text", text: "after" }] },
  ]);
});

test("adjacent assistant tool_use blocks emit no empty message items", () => {
  const req = makeRequest({
    tools: [makeTool({ name: "ls" })],
    messages: [
      {
        role: "assistant",
        content: [
          { type: "tool_use", id: "a", name: "ls", input: {} },
          { type: "tool_use", id: "b", name: "ls", input: {} },
        ],
      },
    ],
  });

  const { input } = ToResponses(req).body;
  expect(input.some((item) => item.type === "message")).toBe(false);
  expect(input.filter((i) => i.type === "function_call")).toEqual([
    { type: "function_call", call_id: "a", name: "ls", arguments: "{}" },
    { type: "function_call", call_id: "b", name: "ls", arguments: "{}" },
  ]);
});

// ---------------------------------------------------------------------------
// Type-level exports
// ---------------------------------------------------------------------------

test("ToResponses returns {body, toolNames}", () => {
  const req = makeRequest({ messages: [{ role: "user", content: "hi" }] });
  const result: ToResponsesResult = ToResponses(req);
  expect(result).toHaveProperty("body");
  expect(result).toHaveProperty("toolNames");
  expect(Array.isArray(result.toolNames)).toBe(true);
  expect(typeof result.body.model).toBe("string");
});
// ---------------------------------------------------------------------------
// id-less tool_result minting — the untested half of the call_id rule
// ---------------------------------------------------------------------------

test("an id-less tool_result answers the outstanding tool_use instead of becoming user text", () => {
  const req = makeRequest({
    messages: [
      {
        role: "assistant",
        content: [{ type: "tool_use", id: "t1", name: "ls", input: {} }],
      },
      // `tool_use_id` omitted — Claude Code history is not always well-formed.
      { role: "user", content: [{ type: "tool_result", content: "file listing" }] },
    ],
  });

  const { input } = ToResponses(req).body;

  expect(input).toEqual([
    { type: "function_call", call_id: "t1", name: "ls", arguments: "{}" },
    { type: "function_call_output", call_id: "t1", output: "file listing" },
  ]);
  // The genuine tool output must never be reported as an interruption, nor
  // demoted to a user message the model reads as typed input.
  expect(JSON.stringify(input)).not.toContain(INTERRUPTED_OUTPUT);
  expect(input.some((i) => i.type === "message")).toBe(false);
});

test("a fully id-less tool_use / tool_result pair still pairs on a minted id", () => {
  const req = makeRequest({
    messages: [
      { role: "assistant", content: [{ type: "tool_use", name: "ls", input: {} }] },
      { role: "user", content: [{ type: "tool_result", content: "listing" }] },
    ],
  });

  const { input } = ToResponses(req).body;

  expect(input.length).toBe(2);
  const call = input[0] as { type: string; call_id: string };
  const output = input[1] as { type: string; call_id: string; output: string };
  expect(call.type).toBe("function_call");
  expect(output.type).toBe("function_call_output");
  expect(call.call_id.length).toBeGreaterThan(0);
  expect(output.call_id).toBe(call.call_id);
  expect(output.output).toBe("listing");
});

test("an id-less tool_result with no outstanding call is still folded into a user message", () => {
  const req = makeRequest({
    messages: [{ role: "user", content: [{ type: "tool_result", content: "orphaned" }] }],
  });

  const { input } = ToResponses(req).body;

  expect(input).toEqual([
    { type: "message", role: "user", content: [{ type: "input_text", text: "orphaned" }] },
  ]);
});

test("an id-less tool_result adopts the EARLIEST unanswered call, leaving later ones interrupted", () => {
  const req = makeRequest({
    messages: [
      {
        role: "assistant",
        content: [
          { type: "tool_use", id: "t1", name: "ls", input: {} },
          { type: "tool_use", id: "t2", name: "ls", input: {} },
        ],
      },
      { role: "user", content: [{ type: "tool_result", content: "first result" }] },
    ],
  });

  const { input } = ToResponses(req).body;

  expect(input).toEqual([
    { type: "function_call", call_id: "t1", name: "ls", arguments: "{}" },
    { type: "function_call", call_id: "t2", name: "ls", arguments: "{}" },
    { type: "function_call_output", call_id: "t2", output: INTERRUPTED_OUTPUT },
    { type: "function_call_output", call_id: "t1", output: "first result" },
  ]);
});
