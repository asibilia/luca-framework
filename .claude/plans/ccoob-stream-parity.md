# cc-openai-bridge: Anthropic SSE stream parity with macaz-cli

## Context

Validated our `src/gateway/stream.ts` + `src/protocol/collector.ts` against
macaz-cli's authoritative Anthropic-side writer (`internal/gateway/server.go`
`streamMessages`, lines 261–388) and its Anthropic parser
(`internal/provider/anthropic/anthropic.go` `collector.handle`).

**Already done + validated correct:** the `content_block_delta` framing fix in
`emitDelta` (single event name, `delta.type` carries the kind). macaz emits
deltas identically (server.go:317–345). The "previous response didn't render"
bug is fixed; 366 tests pass, tsc clean.

**Three remaining divergences** macaz reveals (all cosmetic/correctness, not
the rendering bug). Each is independent and verifiable.

## Tasks

### Task 1 — `message_start.model` = requested public id
- **File:** `src/gateway/stream.ts` (`forwardEvent`, `message_start` case ~line 193).
- **Now:** forwards the collector's `message.model`, which is `""` because the
  ChatGPT subscription `response.created` omits `model`.
- **macaz:** uses `requestedModel` (the public id the client sent) for
  `message_start.model` (server.go:286), independent of upstream.
- **Fix:** in `streamMessages`, capture `const requestedModel = opts.req.model`
  (the public id, e.g. `claude-ccob-gpt-5`) and pass it into `forwardEvent` (or
  override `message.model` in the emit closure). `opts.req` is `routed`, whose
  `.model` is the unmodified public id (server.ts:364,385).
- **Verify:** extend `test/gateway-server.test.ts` streaming test to assert the
  `message_start` frame's `message.model` equals the requested public id.

### Task 2 — `message_delta.usage` carries full usage
- **File:** `src/protocol/collector.ts` `emitMessageDelta` (lines 236–250).
- **Now:** emits `usage: { output_tokens: state.usage.output_tokens }` — drops
  `input_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`.
- **macaz:** sends the full `result.Usage` in `message_delta` (server.go:374).
- **Fix:** emit the full `state.usage` object (input_tokens, output_tokens, and
  optional cache fields), matching the Anthropic `message_delta.usage` shape.
  (If the upstream subscription endpoint returns zero usage, the values stay
  zero — that's an upstream limitation, not a wire bug — but we no longer drop
  fields the upstream does provide.)
- **Verify:** unit test in `test/collector*.test.ts` (or gateway-handlers) that
  a stream carrying input_tokens + cache tokens surfaces them in the
  `message_delta` frame.

### Task 3 — emit `signature_delta` for thinking blocks before stop
- **File:** `src/protocol/collector.ts` `handleOutputItemDone` (lines 398–442).
- **Now:** stores `block.signature` from `item.encrypted_content` but never
  emits a `signature_delta` event — the signature is lost on the wire.
- **macaz:** emits a `signature_delta` `content_block_delta` immediately before
  `content_block_stop` for thinking blocks with a signature (server.go:332–343).
- **Fix:** in `handleOutputItemDone`, when `block.type === "thinking"` and
  `block.signature` is non-empty, emit a
  `{ type: "signature_delta", index, signature: block.signature }` event before
  `emitContentBlockStop`. `forwardEvent` already handles `signature_delta`.
  Apply the same in `handleTerminal`'s closeOpen branch for thinking blocks.
- **Verify:** unit test feeding a `response.output_item.done` with
  `encrypted_content` for a reasoning item, asserting a `signature_delta`
  event precedes `content_block_stop`.

## Non-goals
- Open-block cleanup after generate (macaz:372–374) — our collector already
  closes open blocks in `handleTerminal`; redundant here.
- `streamStartBlock` normalization — our `emitContentBlockStart` already
  produces the macaz-equivalent placeholder shape.

## Verification
- `bunx --bun tsc --noEmit` clean.
- `timeout 180 bun test` — all green (366+ with the 3 new assertions).
- Manual: run the bridge with `CCOB_DEBUG=1`, confirm the debug log's
  `message_start` carries the public model id, `message_delta` carries full
  usage, and a thinking request emits `signature_delta`.