/**
 * luca-code — protocol/ToResponses (step 4/18).
 *
 * Ports macaz `internal/protocol/openai.go` `ToResponses` + `responsesInput`:
 * translates an Anthropic Messages API request into an OpenAI Responses API
 * body map.
 *
 * Mapping summary (authoritative spec, step 4):
 *   - system              -> top-level `instructions` (string)
 *   - messages            -> `input[]`, in wire order: text/image blocks
 *                            accumulate into a message item that is flushed
 *                            whenever a top-level block (tool_use, thinking,
 *                            tool_result) interrupts the run
 *       user text         -> input_text (in a message item, role "user")
 *       user image        -> input_image with a data: URL (or passthrough url)
 *       assistant text    -> output_text (in a message item, role "assistant")
 *       assistant thinking-> top-level reasoning {summary, encrypted_content?}
 *       assistant tool_use-> top-level function_call {call_id, name, arguments}
 *       user tool_result  -> top-level function_call_output {call_id, output}
 *   - the assembled `input[]` is then reconciled so every function_call is
 *     paired with a function_call_output and no call_id is empty — see
 *     `reconcileCallIds`
 *   - tools               -> {type:"function", name, description, parameters,
 *                              strict:false}; `parallel_tool_calls:false`
 *   - server-side tools (web_search, bash_, computer_, text_editor_,
 *     code_execution, web_fetch) are rejected with a thrown Error
 *   - tool_choice auto/any/none/tool -> "auto"/"required"/"none"/
 *                              {type:"function", name}
 *   - reasoning: thinking.budget_tokens -> effort bucket; sets
 *     `reasoning:{effort, summary:"auto"}` + `include:["reasoning.encrypted_content"]`
 *   - sanitizeSubscription: drop user / max_output_tokens / truncation /
 *     previous_response_id; always set `store:false`, `stream:req.stream`, `model`
 *   - NewToolNames: normalize tool names to /^[A-Za-z0-9_-]{1,64}$/ via a
 *     sha256-prefixed fallback when out of range
 *
 * Returns `{ body, toolNames }`.
 *
 * Schema-first per the global rules: Zod schemas own the parsing of the raw
 * `tool_choice` and `thinking` fields (which are `unknown` on the Request
 * type). No defaults are set via destructuring.
 */

import { createHash } from "node:crypto";

import { z } from "zod";

import type { Block, Request, Tool } from "./types";
import { DecodeBlocks, SystemText } from "./types";

// ---------------------------------------------------------------------------
// Tool-name normalization (macaz NewToolNames)
// ---------------------------------------------------------------------------

/** OpenAI Responses function-name grammar. */
const TOOL_NAME_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Map an Anthropic tool name to a Responses-safe function name.
 *
 * Names already matching `/^[A-Za-z0-9_-]{1,64}$/` pass through unchanged.
 * Out-of-range names (spaces, dots, too long, etc.) are replaced by a stable
 * `t_` + sha256 hex prefix (2 + 62 = 64 chars, fits the grammar).
 *
 * Returns a Map from original name -> normalized name.
 */
export function newToolNames(names: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const name of names) {
    if (TOOL_NAME_RE.test(name)) {
      map.set(name, name);
      continue;
    }
    const hex = createHash("sha256").update(name, "utf8").digest("hex");
    map.set(name, `t_${hex.slice(0, 62)}`);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Effort bucket (macaz Effort — mapped from thinking.budget_tokens)
// ---------------------------------------------------------------------------

export type EffortBucket = "low" | "medium" | "high";

/**
 * Map an Anthropic `thinking.budget_tokens` value to an OpenAI Responses
 * reasoning effort bucket.
 *
 * Thresholds follow the macaz effort ladder. budget <= 0 (or absent) yields
 * the default "medium".
 */
export function effortFromBudget(budgetTokens: number): EffortBucket {
  if (budgetTokens <= 0) return "medium";
  if (budgetTokens < 8192) return "low";
  if (budgetTokens < 32768) return "medium";
  return "high";
}

// ---------------------------------------------------------------------------
// Server-side tool rejection
// ---------------------------------------------------------------------------

interface ServerToolRejector {
  exact?: string;
  prefix?: string;
}

/** Anthropic server-side tools the Responses bridge cannot represent. */
const SERVER_TOOL_REJECTORS: ReadonlyArray<ServerToolRejector> = [
  { exact: "web_search" },
  { exact: "web_fetch" },
  { exact: "code_execution" },
  { prefix: "bash_" },
  { prefix: "computer_" },
  { prefix: "text_editor_" },
  { prefix: "code_execution_" },
];

function isServerTool(name: string): boolean {
  for (const r of SERVER_TOOL_REJECTORS) {
    if (r.exact !== undefined && name === r.exact) return true;
    if (r.prefix !== undefined && name.startsWith(r.prefix)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Schemas for raw Request fields (owned here, parsed with safeParse)
// ---------------------------------------------------------------------------

const ToolChoiceSchema = z.object({
  type: z.enum(["auto", "any", "none", "tool"]),
  name: z.string().optional(),
});

const ThinkingSchema = z
  .object({
    type: z.string().optional(),
    budget_tokens: z.number().int().nonnegative().optional(),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface ResponsesTool {
  type: "function";
  name: string;
  description: string;
  parameters: unknown;
  strict: false;
}

export type ResponsesInputItem =
  | { type: "message"; role: string; content: Array<Record<string, unknown>> }
  | { type: "function_call"; call_id: string; name: string; arguments: string }
  | { type: "function_call_output"; call_id: string; output: string }
  | {
      type: "reasoning";
      /** Encrypted reasoning blob for replay; omitted when only a summary is available. */
      encrypted_content?: string;
      /** Required by the Responses API on reasoning input items. */
      summary: Array<{ type: "summary_text"; text: string }>;
    };

export interface ResponsesBody {
  model: string;
  instructions: string;
  input: ResponsesInputItem[];
  tools: ResponsesTool[];
  tool_choice?: unknown;
  parallel_tool_calls: false;
  store: false;
  stream: boolean;
  reasoning?: { effort: EffortBucket; summary: "auto" };
  include?: string[];
}

export interface ToResponsesResult {
  body: ResponsesBody;
  toolNames: string[];
}

// ---------------------------------------------------------------------------
// Block helpers
// ---------------------------------------------------------------------------

/** Convert an Anthropic image block to a Responses input_image data/url string. */
function imageDataUrl(block: Block): string {
  const source = block.source;
  if (!source) return "";
  if (source.type === "url") {
    const url = source["url"];
    return typeof url === "string" ? url : "";
  }
  if (source.type === "base64") {
    const data = source["data"];
    const media =
      typeof source["media_type"] === "string" ? (source["media_type"] as string) : "image/png";
    return typeof data === "string" ? `data:${media};base64,${data}` : "";
  }
  return "";
}

/** Render a tool_result `content` (string | Block[] | undefined) as a string. */
function toolResultOutput(content: string | Block[] | undefined): string {
  if (content == null) return "";
  if (typeof content === "string") return content;
  return JSON.stringify(content);
}

/**
 * Flush the accumulated contiguous text/image segment as a `message` item and
 * reset it, preserving Anthropic block order around top-level items.
 *
 * Anthropic content blocks are a flat ordered list, but the Responses API
 * splits them across two levels: text/image blocks live inside a `message`
 * item while tool_use / tool_result / thinking blocks are top-level items. The
 * only way to keep the original order is to close the current message segment
 * whenever a top-level block appears and start a fresh one after it.
 *
 * An empty segment emits nothing — adjacent top-level blocks must never
 * produce empty `message` items.
 */
function flushMessageSegment(
  input: ResponsesInputItem[],
  role: string,
  segment: Array<Record<string, unknown>>,
): void {
  if (segment.length === 0) return;
  input.push({ type: "message", role, content: [...segment] });
  segment.length = 0;
}

// ---------------------------------------------------------------------------
// call_id reconciliation
// ---------------------------------------------------------------------------

/**
 * Prefix for synthetic call ids minted when an Anthropic `tool_use` /
 * `tool_result` block carries no id. The suffix is the block's position in the
 * emitted `input[]` array, so two id-less calls in one turn can never collide
 * and the same history always translates to the same ids.
 */
const SYNTHETIC_CALL_ID_PREFIX = "luca_code_call_";

/**
 * Output sent upstream for a `function_call` that never received a result.
 *
 * Claude Code routinely produces this shape: the user hits ESC while a tool is
 * running, or declines a permission prompt, and the assistant turn holding the
 * `tool_use` stays in history with no matching `tool_result`. The Responses API
 * rejects such input with 400 "No tool output found for function call <id>",
 * and because the unpaired turn stays in history every subsequent request in
 * the session fails the same way.
 */
const INTERRUPTED_TOOL_OUTPUT = "[tool call was interrupted before it produced a result]";

/**
 * Give every `function_call` / `function_call_output` item a non-empty call id.
 *
 * Mutates `items` in place. A `function_call` with no id gets one derived from
 * its index, which is stable for a given translation and unique across the
 * array.
 *
 * An id-less `function_call_output` is NOT index-minted first: it ADOPTS the
 * call id of the earliest still-unanswered `function_call` before it. Anthropic
 * history routinely carries a `tool_result` whose `tool_use_id` was dropped,
 * and an index-derived id can never match the call it answers — the real tool
 * output would then be folded into a user message while the model is told the
 * call was interrupted, i.e. the genuine result is presented as if the user had
 * typed it. Adoption puts the payload in the output slot it belongs to.
 *
 * Only when no unanswered call precedes it does an id-less output fall back to
 * an index-derived id, which leaves it an orphan for {@link foldOrphanOutput}.
 */
function mintSyntheticCallIds(items: ResponsesInputItem[]): void {
  // call ids of `function_call`s seen so far that no output has claimed yet,
  // in arrival order (FIFO — the same order pass 1 of reconcileCallIds pairs).
  const unanswered: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    if (item.type === "function_call") {
      if (item.call_id.length === 0) {
        item.call_id = `${SYNTHETIC_CALL_ID_PREFIX}${i}`;
      }
      unanswered.push(item.call_id);
      continue;
    }
    if (item.type !== "function_call_output") continue;
    if (item.call_id.length === 0) {
      item.call_id = unanswered.shift() ?? `${SYNTHETIC_CALL_ID_PREFIX}${i}`;
      continue;
    }
    const claimed = unanswered.indexOf(item.call_id);
    if (claimed !== -1) unanswered.splice(claimed, 1);
  }
}

/**
 * Fold a dropped `function_call_output` payload into an adjacent user message.
 *
 * Preference order: append to the immediately preceding user message (already
 * emitted), else prepend to the immediately following user message, else insert
 * a standalone user message in the orphan's place. An empty payload is dropped
 * outright — there is nothing to preserve.
 *
 * `out` is the array built so far; `next` is the source item that will be
 * pushed after the orphan (or `undefined` at the end of the array).
 */
function foldOrphanOutput(
  out: ResponsesInputItem[],
  output: string,
  next: ResponsesInputItem | undefined,
): void {
  if (output.length === 0) return;
  const textBlock = { type: "input_text", text: output };

  const prev = out[out.length - 1];
  if (prev !== undefined && prev.type === "message" && prev.role === "user") {
    prev.content.push(textBlock);
    return;
  }
  if (next !== undefined && next.type === "message" && next.role === "user") {
    next.content.unshift(textBlock);
    return;
  }
  out.push({ type: "message", role: "user", content: [textBlock] });
}

/**
 * Reconcile function-call identity across the assembled `input[]`.
 *
 * The Responses API enforces call pairing on input and rejects both unpaired
 * shapes with a 400 that the bridge can only surface as an opaque 502. This
 * pass guarantees the request we send is always well-formed:
 *
 *   1. No item ever carries `call_id: ""` (see {@link mintSyntheticCallIds}).
 *   2. A `function_call` with no LATER `function_call_output` sharing its
 *      call_id gets one synthesized immediately after it.
 *   3. A `function_call_output` with no EARLIER unconsumed `function_call`
 *      sharing its call_id is dropped, its payload folded into an adjacent
 *      user message rather than silently lost.
 *
 * Matching is FIFO per call_id, so a duplicate output for an already-answered
 * call is treated as an orphan. Already-matched pairs keep their exact wire
 * order and content — a well-formed history translates byte-for-byte.
 */
function reconcileCallIds(items: ResponsesInputItem[]): ResponsesInputItem[] {
  mintSyntheticCallIds(items);

  // Pass 1 — pair outputs to the earliest unconsumed call sharing their id.
  const answeredCalls = new Set<number>();
  const matchedOutputs = new Set<number>();
  const unconsumedCalls = new Map<string, number[]>();
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    if (item.type === "function_call") {
      const queue = unconsumedCalls.get(item.call_id);
      if (queue === undefined) unconsumedCalls.set(item.call_id, [i]);
      else queue.push(i);
    } else if (item.type === "function_call_output") {
      const callIndex = unconsumedCalls.get(item.call_id)?.shift();
      if (callIndex !== undefined) {
        answeredCalls.add(callIndex);
        matchedOutputs.add(i);
      }
    }
  }

  // Pass 2 — emit, synthesizing missing outputs and folding orphaned ones.
  const out: ResponsesInputItem[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    if (item.type === "function_call_output" && !matchedOutputs.has(i)) {
      foldOrphanOutput(out, item.output, items[i + 1]);
      continue;
    }
    out.push(item);
    if (item.type === "function_call" && !answeredCalls.has(i)) {
      out.push({
        type: "function_call_output",
        call_id: item.call_id,
        output: INTERRUPTED_TOOL_OUTPUT,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// ToResponses
// ---------------------------------------------------------------------------

/**
 * Translate an Anthropic Messages request into an OpenAI Responses body map.
 *
 * Throws a clear Error if the request carries an Anthropic server-side tool
 * (web_search, bash_, computer_, text_editor_, code_execution, web_fetch)
 * that the Responses bridge cannot represent.
 *
 * Returns `{ body, toolNames }` where `toolNames` is the list of normalized
 * function names parallel to `req.tools`.
 */
export function ToResponses(req: Request): ToResponsesResult {
  // Reject server-side tools up front.
  for (const t of req.tools) {
    if (isServerTool(t.name)) {
      throw new Error(
        `luca-code: Anthropic server-side tool "${t.name}" is not supported by the OpenAI Responses bridge`,
      );
    }
  }

  const toolNameMap = newToolNames(req.tools.map((t: Tool) => t.name));

  // system -> instructions
  const instructions = SystemText(req.system);

  // messages -> input[]
  const input: ResponsesInputItem[] = [];
  for (const msg of req.messages) {
    const blocks = DecodeBlocks(msg.content);
    // Blocks are walked in wire order for BOTH roles. Text/image blocks
    // accumulate into `msgContent`; every top-level block (tool_use, thinking,
    // tool_result) first flushes that segment, so a turn such as
    // [thinking, text, thinking, tool_use] translates to
    // [reasoning, message, reasoning, function_call] rather than hoisting all
    // reasoning to the front and sinking all calls to the back.
    const msgContent: Array<Record<string, unknown>> = [];

    for (const block of blocks) {
      if (msg.role === "assistant") {
        if (block.type === "text") {
          msgContent.push({ type: "output_text", text: block.text ?? "" });
        } else if (block.type === "tool_use") {
          flushMessageSegment(input, msg.role, msgContent);
          const rawName = block.name ?? "";
          input.push({
            type: "function_call",
            call_id: block.id ?? "",
            name: toolNameMap.get(rawName) ?? rawName,
            arguments: JSON.stringify(block.input ?? {}),
          });
        } else if (block.type === "thinking") {
          // Replay a prior assistant thinking block as a Responses `reasoning`
          // input item. The API REQUIRES `summary` on reasoning items (a missing
          // summary returns upstream 400 "Missing required parameter:
          // 'input[N].summary'"). `encrypted_content` carries the signed
          // reasoning blob (Anthropic `signature`) for replay — only include
          // it when a real signature exists; plain thinking text is NOT
          // encrypted content and must not be sent as such.
          const item: {
            type: "reasoning";
            summary: Array<{ type: "summary_text"; text: string }>;
            encrypted_content?: string;
          } = {
            type: "reasoning",
            summary: [{ type: "summary_text", text: block.thinking ?? "" }],
          };
          if (typeof block.signature === "string" && block.signature.length > 0) {
            item.encrypted_content = block.signature;
          }
          flushMessageSegment(input, msg.role, msgContent);
          input.push(item);
        }
      } else {
        // user (default)
        if (block.type === "text") {
          msgContent.push({ type: "input_text", text: block.text ?? "" });
        } else if (block.type === "image") {
          msgContent.push({ type: "input_image", image_url: imageDataUrl(block) });
        } else if (block.type === "tool_result") {
          flushMessageSegment(input, msg.role, msgContent);
          input.push({
            type: "function_call_output",
            call_id: block.tool_use_id ?? "",
            output: toolResultOutput(block.content),
          });
        }
      }
    }

    flushMessageSegment(input, msg.role, msgContent);
  }

  // tools -> {type:"function", name, description, parameters, strict:false}
  const tools: ResponsesTool[] = req.tools.map((t: Tool) => ({
    type: "function",
    name: toolNameMap.get(t.name) ?? t.name,
    description: t.description,
    parameters: t.input_schema,
    strict: false as const,
  }));

  // tool_choice
  let toolChoice: unknown = undefined;
  if (req.tool_choice != null) {
    const parsed = ToolChoiceSchema.safeParse(req.tool_choice);
    if (parsed.success) {
      const tc = parsed.data;
      if (tc.type === "auto") toolChoice = "auto";
      else if (tc.type === "any") toolChoice = "required";
      else if (tc.type === "none") toolChoice = "none";
      else if (tc.type === "tool") {
        const rawName = tc.name ?? "";
        toolChoice = { type: "function", name: toolNameMap.get(rawName) ?? rawName };
      }
    }
  }

  const body: ResponsesBody = {
    model: req.model,
    instructions,
    input: reconcileCallIds(input),
    tools,
    parallel_tool_calls: false,
    store: false,
    stream: req.stream,
  };
  if (toolChoice !== undefined) {
    body.tool_choice = toolChoice;
  }

  // reasoning from thinking budget_tokens
  if (req.thinking != null) {
    const t = ThinkingSchema.safeParse(req.thinking);
    if (t.success && typeof t.data.budget_tokens === "number" && t.data.budget_tokens > 0) {
      body.reasoning = { effort: effortFromBudget(t.data.budget_tokens), summary: "auto" };
      body.include = ["reasoning.encrypted_content"];
    }
  }

  const toolNames = req.tools.map((t: Tool) => toolNameMap.get(t.name) ?? t.name);

  return { body, toolNames };
}