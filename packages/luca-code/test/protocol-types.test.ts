import { test, expect, expectTypeOf } from "bun:test";
import {
  DecodeBlocks,
  SystemText,
  type Request,
  type Message,
  type Tool,
  type Block,
  type Source,
  type Usage,
  type Result,
  type Event,
  type EmitFunc,
  type RawRequest,
  type RawMessage,
  type RawTool,
  type RawBlock,
} from "../src/protocol/types";

// ---------------------------------------------------------------------------
// DecodeBlocks
// ---------------------------------------------------------------------------

test("DecodeBlocks: string content becomes a single text block", () => {
  const blocks = DecodeBlocks("hello world");
  expect(blocks).toEqual([{ type: "text", text: "hello world" }]);
});

test("DecodeBlocks: null/undefined content yields empty array", () => {
  expect(DecodeBlocks(null)).toEqual([]);
  expect(DecodeBlocks(undefined)).toEqual([]);
});

test("DecodeBlocks: array of blocks passes through untouched (non-tool_use)", () => {
  const input: unknown = [
    { type: "text", text: "a" },
    { type: "thinking", thinking: "h", signature: "s" },
  ];
  const blocks = DecodeBlocks(input);
  expect(blocks).toHaveLength(2);
  expect(blocks[0]!).toEqual({ type: "text", text: "a" });
  expect(blocks[1]!).toEqual({ type: "thinking", thinking: "h", signature: "s" });
});

test("DecodeBlocks: tool_use block with missing input defaults to {}", () => {
  const input: unknown = [{ type: "tool_use", id: "t1", name: "ls" }];
  const blocks = DecodeBlocks(input);
  expect(blocks).toHaveLength(1);
  expect(blocks[0]!).toEqual({
    type: "tool_use",
    id: "t1",
    name: "ls",
    input: {},
  });
});

test("DecodeBlocks: tool_use block with explicit input preserves it", () => {
  const input: unknown = [
    { type: "tool_use", id: "t2", name: "run", input: { cmd: "echo hi" } },
  ];
  const blocks = DecodeBlocks(input);
  expect(blocks[0]!.input).toEqual({ cmd: "echo hi" });
});

test("DecodeBlocks: tool_use block with null input defaults to {}", () => {
  const input: unknown = [{ type: "tool_use", id: "t3", name: "x", input: null }];
  const blocks = DecodeBlocks(input);
  expect(blocks[0]!.input).toEqual({});
});

test("DecodeBlocks: tool_result content is not recursively decoded (raw passthrough)", () => {
  const input: unknown = [
    {
      type: "tool_result",
      tool_use_id: "t1",
      content: "raw string result",
      is_error: false,
    },
  ];
  const blocks = DecodeBlocks(input);
  expect(blocks[0]!).toEqual({
    type: "tool_result",
    tool_use_id: "t1",
    content: "raw string result",
    is_error: false,
  });
});

test("DecodeBlocks: mixed blocks only tool_use inputs are normalized", () => {
  const input: unknown = [
    { type: "text", text: "thinking..." },
    { type: "tool_use", id: "a", name: "foo" },
    { type: "tool_use", id: "b", name: "bar", input: { k: 1 } },
  ];
  const blocks = DecodeBlocks(input);
  expect(blocks[1]!.input).toEqual({});
  expect(blocks[2]!.input).toEqual({ k: 1 });
});

// ---------------------------------------------------------------------------
// SystemText
// ---------------------------------------------------------------------------

test("SystemText: string system returns the string", () => {
  expect(SystemText("you are helpful")).toBe("you are helpful");
});

test("SystemText: null/undefined system returns empty string", () => {
  expect(SystemText(null)).toBe("");
  expect(SystemText(undefined)).toBe("");
});

test("SystemText: array of text blocks joins text fields", () => {
  const system: unknown = [
    { type: "text", text: "rule one" },
    { type: "text", text: "rule two" },
  ];
  expect(SystemText(system)).toBe("rule one\nrule two");
});

test("SystemText: array with non-text blocks skips them", () => {
  const system: unknown = [
    { type: "text", text: "keep" },
    { type: "thinking", thinking: "skip" },
    { type: "text", text: "also keep" },
  ];
  expect(SystemText(system)).toBe("keep\nalso keep");
});

test("SystemText: array of text blocks with cache_control still extracts text", () => {
  const system: unknown = [
    { type: "text", text: "cached", cache_control: { type: "ephemeral" } },
  ];
  expect(SystemText(system)).toBe("cached");
});

test("SystemText: empty array returns empty string", () => {
  expect(SystemText([])).toBe("");
});

// ---------------------------------------------------------------------------
// Type-level exports (compile-time sanity via expectTypeOf)
// ---------------------------------------------------------------------------

test("types are exported with the expected shapes", () => {
  expectTypeOf<Request>().toMatchTypeOf<{ model: string; max_tokens: number }>();
  expectTypeOf<Message>().toMatchTypeOf<{ role: string }>();
  expectTypeOf<Tool>().toMatchTypeOf<{ type: string; name: string }>();
  expectTypeOf<Block>().toMatchTypeOf<{ type: string }>();
  expectTypeOf<Usage>().toMatchTypeOf<{ input_tokens: number; output_tokens: number }>();
  expectTypeOf<Result>().toMatchTypeOf<{ model: string; stop_reason: string }>();
  expectTypeOf<Source>().toMatchTypeOf<{ type: string }>();

  // Raw equivalents exist and are structurally looser (content is unknown).
  expectTypeOf<RawRequest>().toMatchTypeOf<{ model: string }>();
  expectTypeOf<RawMessage>().toMatchTypeOf<{ role: string; content: unknown }>();
  expectTypeOf<RawTool>().toMatchTypeOf<{ name: string }>();
  expectTypeOf<RawBlock>().toMatchTypeOf<{ type: string }>();

  // Event / EmitFunc are callable types.
  expectTypeOf<EmitFunc>().toBeFunction();
  expectTypeOf<Event>().not.toBeNever();
});

test("DecodeBlocks and SystemText are functions", () => {
  expect(typeof DecodeBlocks).toBe("function");
  expect(typeof SystemText).toBe("function");
});