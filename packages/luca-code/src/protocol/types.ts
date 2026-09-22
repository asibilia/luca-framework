/**
 * luca-code — protocol types (step 3/18).
 *
 * Ports macaz internal/protocol/types.go to TypeScript. These describe the
 * Anthropic Messages API shape that Claude Code emits and that the gateway
 * must translate to/from the OpenAI Responses API.
 *
 * Bun has no `json.RawMessage`; fields that macaz held as raw JSON are typed
 * `unknown` (or `string` where the value is known to be a JSON string) and
 * are parsed lazily by the helpers below (`DecodeBlocks`, `SystemText`) or by
 * downstream translators.
 *
 * Per the spec these are plain TS types plus raw equivalents — not Zod schemas.
 * The schema-first rule governs config/input parsing in other steps; here the
 * wire shape is fixed by the Anthropic API and modeled directly.
 */

// ---------------------------------------------------------------------------
// Source — citation / provenance for text blocks.
// ---------------------------------------------------------------------------

export interface Source {
  type: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Block — a single content block. All optional fields are union across the
// block variants (text, thinking, tool_use, tool_result, ...). `raw` keeps
// the original payload for fidelity when translating.
// ---------------------------------------------------------------------------

export interface Block {
  type: string;
  /** text blocks */
  text?: string;
  /** thinking blocks (extended thinking) */
  thinking?: string;
  signature?: string;
  /** tool_use blocks */
  id?: string;
  name?: string;
  input?: unknown;
  /** tool_result blocks */
  tool_use_id?: string;
  content?: string | Block[];
  is_error?: boolean;
  /** citations */
  source?: Source;
  /** titled / structured block variants */
  title?: string;
  tool_name?: string;
  /** original raw payload, preserved for round-trip fidelity */
  raw?: unknown;
}

/** Raw block: content/input fields stay `unknown` until lazily parsed. */
export interface RawBlock {
  type: string;
  text?: string;
  thinking?: string;
  signature?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
  source?: Source;
  title?: string;
  tool_name?: string;
  raw?: unknown;
}

// ---------------------------------------------------------------------------
// Message — a single chat turn. `content` is raw (string | Block[]).
// ---------------------------------------------------------------------------

export interface Message {
  role: string;
  content: string | Block[];
}

export interface RawMessage {
  role: string;
  content: unknown;
}

// ---------------------------------------------------------------------------
// Tool — tool definition. `input_schema` is raw JSON. The `client_*` and
// `defer_loading` fields are internal (macaz) metadata.
// ---------------------------------------------------------------------------

export interface Tool {
  type: string;
  name: string;
  description: string;
  input_schema: unknown;
  /** internal: defer tool schema loading until first call */
  defer_loading?: boolean;
  /** internal: client metadata */
  client_type?: string;
  client_name?: string;
  client_namespace?: string;
}

export interface RawTool {
  type: string;
  name: string;
  description: string;
  input_schema: unknown;
  defer_loading?: boolean;
  client_type?: string;
  client_name?: string;
  client_namespace?: string;
}

// ---------------------------------------------------------------------------
// Usage / Result
// ---------------------------------------------------------------------------

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export interface Result {
  model: string;
  blocks: Block[];
  stop_reason: string;
  usage: Usage;
}

// ---------------------------------------------------------------------------
// Request — the Anthropic Messages request. `system`, `tool_choice`,
// `thinking`, `output_config`, `output_format`, `metadata` are raw JSON.
// `prompt_cache_key` is internal.
// ---------------------------------------------------------------------------

export interface Request {
  model: string;
  max_tokens: number;
  messages: Message[];
  /** raw: string | Block[] | unknown */
  system: unknown;
  tools: Tool[];
  /** raw: tool choice spec */
  tool_choice: unknown;
  stop_sequences: string[];
  stream: boolean;
  temperature?: number;
  top_p?: number;
  /** raw: extended-thinking config */
  thinking: unknown;
  /** raw / internal: output config */
  output_config: unknown;
  /** raw: output format spec */
  output_format: unknown;
  /** raw: request metadata */
  metadata: unknown;
  service_tier?: string;
  speed?: string;
  /** internal: prompt cache key */
  prompt_cache_key?: string;
}

export interface RawRequest {
  model: string;
  max_tokens: number;
  messages: RawMessage[];
  system: unknown;
  tools: RawTool[];
  tool_choice: unknown;
  stop_sequences: string[];
  stream: boolean;
  temperature?: number;
  top_p?: number;
  thinking: unknown;
  output_config: unknown;
  output_format: unknown;
  metadata: unknown;
  service_tier?: string;
  speed?: string;
  prompt_cache_key?: string;
}

// ---------------------------------------------------------------------------
// Event / EmitFunc — streaming event surface.
// ---------------------------------------------------------------------------

export interface Event {
  type: string;
  [key: string]: unknown;
}

export type EmitFunc = (event: Event) => void | Promise<void>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Decode raw message/block content into a normalized `Block[]`.
 *
 * - `string` content becomes a single text block: `[{ type: "text", text }]`.
 * - `null` / `undefined` content yields `[]`.
 * - Array content is passed through with one normalization: a `tool_use` block
 *   whose `input` is missing or `null` gets `input: {}` (matches macaz
 *   `DecodeBlocks`, which defaults tool_use input to the empty object so
 *   downstream JSON serialization never emits `input: null`).
 * - Non-array, non-string content is treated as a single-block wrapper to
 *   keep translation robust, but the spec only requires string | array.
 *
 * `tool_result.content` is left untouched (raw passthrough) — it is not
 * recursively decoded.
 */
export function DecodeBlocks(content: unknown): Block[] {
  if (content == null) return [];
  if (typeof content === "string") {
    return [{ type: "text", text: content }];
  }
  if (!Array.isArray(content)) return [];
  return content.map((raw): Block => {
    const block = (raw ?? {}) as Record<string, unknown>;
    const type = typeof block["type"] === "string" ? (block["type"] as string) : "";
    const out: Block = { type };
    for (const key of Object.keys(block)) {
      if (key === "type") continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (out as any)[key] = block[key];
    }
    if (type === "tool_use" && (out.input === undefined || out.input === null)) {
      out.input = {};
    }
    return out;
  });
}

/**
 * Extract the system prompt as a plain string.
 *
 * - `string` system returns the string verbatim.
 * - `null` / `undefined` returns `""`.
 * - An array of system blocks (each `{ type: "text", text, ... }`) returns the
 *   `text` fields of the `text` blocks joined with `"\n"`. Non-text blocks
 *   (e.g. `cache_control` carriers that aren't `type: "text"`) are skipped, but
 *   text blocks carrying extra keys like `cache_control` still contribute.
 * - Other shapes return `""`.
 */
export function SystemText(system: unknown): string {
  if (system == null) return "";
  if (typeof system === "string") return system;
  if (!Array.isArray(system)) return "";
  const parts: string[] = [];
  for (const raw of system) {
    const block = raw as Record<string, unknown> | null;
    if (block == null) continue;
    if (block["type"] === "text" && typeof block["text"] === "string") {
      parts.push(block["text"] as string);
    }
  }
  return parts.join("\n");
}