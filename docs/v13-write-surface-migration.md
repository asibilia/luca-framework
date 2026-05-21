# v13 Write-Surface Re-Architecture — Migration Plan

> Status: **DRAFT — for review.** No code has been changed.
> Decision feeds: v13 milestone. Scope: the write-surface layer only.
> Revised after OQ1 research (§7) — content delivery is resolved; the design now
> routes artifact files through the native `Write` tool, not a CLI heredoc.

## 1. Decision

Replace the 27-tool **MCP server** with a two-track write surface, both enforced by the
existing stage-gate hook:

- **Freeform artifact files** (plan, research, context, plan-review, summary, wave,
  audit, learn, verify.json) — written with the agent's **native `Write` tool** to the
  canonical path; the stage-gate hook validates the path is exactly the legal artifact
  for the current `pipelineStep`.
- **Structured / operational mutations** (state, roadmap, preferences, todo, checks,
  pr-review, repo-cleanup, workflow, branch-guard, confidence) — a typed **`luca` CLI**,
  invoked via Bash, small flag/`--file` payloads.

Not Mastra. The MCP server is deleted.

Rationale (research synthesis, §10): MCP is a protocol for reaching *external* systems;
Luca's write surface is a subprocess of the harness mutating files in the harness's own
repo — the wrong layer. A CLI surface has zero standing token cost on every model tier
(MCP Tool Search is disabled on Haiku — exactly where Luca runs cheap agents), is
in-distribution for the model, and eliminates a class of transport bugs (three hit this
session: wrong-file registration, the `zodToInputSchema` stub, the schema handshake).

The migration is **low-risk** because the tool handlers are *already* runtime-agnostic
(§2). The MCP layer is a thin transport shell.

## 2. Current architecture

```
Claude Code agent
  │  calls mcp__luca__luca_phase_write_plan({content})
  ▼
luca mcp serve  (subprocess, src/commands/mcp.ts)
  └─ createLucaMcpServer  (src/mcp/helpers/server-setup.ts)
       ├─ ListTools  ← zodToInputSchema (STUB — returns empty schema)
       └─ CallTool   → phase-precondition check (allowedPhases)
                     → tool.handler(args, {cwd})  → ToolResult
```

**Key files (all under `packages/luca-framework/` unless noted):**

| File | Role | Fate |
|---|---|---|
| `src/commands/mcp.ts` | `luca mcp serve` citty command | **delete** (Phase E) |
| `src/mcp/helpers/server-setup.ts` | MCP `Server`, `ListTools`/`CallTool`, `zodToInputSchema` stub, phase guard | **delete** (Phase E) |
| `src/mcp/helpers/tool-registry.ts` | `TOOL_REGISTRY` — catalog of 27 `ToolDescriptor`s | **delete** |
| `src/mcp/schemas.ts` | `ToolDescriptor`, `ToolContext`, `ToolResult` (= SDK `CallToolResult`) | **replace** — local result type, no SDK |
| `src/mcp/helpers/tools/*.ts` (27) | Tool handlers — `(args, ctx) => Promise<ToolResult>` | **relocate** (Phase A) — already runtime-agnostic |
| `src/mcp/helpers/{resolve-active-slug,write-atomic,build-muninn-instruction,validate-verification-ref}.ts`, `review-analysis/` | Shared helpers | **relocate** (Phase A) |
| `src/init/helpers/wire-mcp-server.ts` | `luca init` writes `.mcp.json` | **delete** (Phase E) |
| `src/hook/helpers/classify-bash-command.ts` | Bash-command classifier (stage-gate) | **extend** (Phase C) |
| `src/hook/helpers/handle-stage-gate-hook.ts` | Stage-gate decision logic | **extend** (Phase C) — becomes the artifact-path gate |
| `@alecsibilia/luca-core` `state/configs/` | `pipeline-transitions.ts`, `stage-tool-matrix.ts`, `classify-write-path.ts` | **extend** (Phases A, C) |

**The crucial fact:** a handler like `lucaPhaseWritePlanTool.handler` already takes plain
`(args, { cwd })`, returns a plain result, and imports only runtime-neutral helpers
(`phasePathFor` from luca-core, `resolveActiveSlug`, `writeAtomicFile`, `loadCurrentState`)
plus a Zod schema. The *only* MCP-coupled things are the `ToolResult` type alias (= SDK
`CallToolResult`) and the `ToolDescriptor` wrapper. The handlers relocate; only the
transport changes.

**Two enforcement facts that shape the design:**
- The stage-gate hook does **not** see MCP tool calls — `mcp__luca__*` calls hit the
  hook's "not write-class — allowing" branch. Today the *MCP server itself* enforces the
  per-verb phase precondition (`allowedPhases`). With MCP gone, that precondition needs a
  new home.
- The hook **does** classify `Bash` and `Write`/`Edit`. For `Write`/`Edit` it inspects
  `tool_input.file_path` only — never the content. For `Bash` it runs `classifyBashCommand`
  on the whole command string. This asymmetry is decisive — see OQ1 (§7).

## 3. Target architecture — two tracks, one guard

```
                          Claude Code agent
        ┌──────────────────────┴───────────────────────┐
        │ Write  →  .luca/phases/<slug>/plan.md          │ Bash  →  luca state advance …
        │ (content in the native `content` field)        │ (small flag / --file payload)
        ▼                                                ▼
   stage-gate hook (PreToolUse) ─────────────────────────────────────
   • Write/Edit to .luca/: allow iff path == the legal artifact for
     the current pipelineStep (computed); block every other .luca/ write
   • Bash `luca …`: recognise, allow through to the CLI
   • raw code writes / non-contract paths: blocked (unchanged)
        │                                                │
        ▼                                                ▼
   file lands at the canonical path              luca CLI (src/commands/…)
                                                 → self-checks phase, calls Layer-1 core
```

| Layer | What | Where |
|---|---|---|
| **1 — Deterministic core** | Runtime-agnostic: canonical path computation, the per-step legal-artifact map, Zod validation for structured payloads, atomic write helper. Zero LLM judgment. | new `src/write-surface/` + `luca-core` `state/configs/` |
| **2 — Stage-gate hook = the artifact-path gate** | For a `Write`/`Edit` under `.luca/phases/`: compute the legal artifact path for the current `pipelineStep` and allow **only** an exact match — this makes the native `Write` tool the safe content channel. Recognise `luca` CLI commands and let them through. Block raw writes to `.luca/` root files and to code. | `src/hook/helpers/*`, `luca-core` `state/configs/classify-write-path.ts` + `stage-tool-matrix.ts` |
| **3 — `luca` CLI** | `luca <noun> <verb> --flags` — ~18 commands for structured/operational mutations only (artifact files do **not** get a CLI command). Sharing Layer 1. Discovery via a `luca-write-surface` skill + `--help` + orchestrator skills naming subcommands directly. | `src/commands/…`, `src/cli.ts`, `skills/skills/luca-write-surface/` |

**Why two tracks.** OQ1 research (§7) proved that putting freeform content inside a Bash
command string is unworkable — the stage-gate classifier parses the whole string as
shell, so document content gets mis-tokenized. The native `Write` tool carries content
in a structured field the hook never shell-parses. So: freeform artifacts → `Write`;
structured mutations (small payloads) → CLI. This also halves the CLI surface (~18 vs 27).

**Path safety is preserved.** The agent *proposes* a path; the hook *computes* the
canonical path for the current step and rejects anything else. "Propose + verify" is the
validation-at-boundary pattern (§10) — equivalent safety to having the server compute the
path, with an independent check.

**`.luca/` root files** (`state.json`, `config.json`, `roadmap.md`, `ledger.jsonl`) are
**never** written by a raw `Write` — the hook blocks that; they are mutated only through
the `luca` CLI (`state advance`, `roadmap create`, `preferences write`, …), which applies
validated transitions.

## 4. Design decisions

- **D1 — Content delivery — RESOLVED (see OQ1, §7).** Freeform artifact files are written
  with the agent's native **`Write` tool** to the canonical path; content travels in
  `Write`'s structured `content` field and never touches the shell. The stage-gate hook
  is the gate. Structured/operational mutations use the **`luca` CLI** with flags or
  `--file`; these run in permissive phases or carry small payloads, so there is no
  content-in-command-string problem. Heredoc / `--content` are rejected — they route
  content through the shell classifier.
- **D2 — CLI shape: noun/verb.** `luca state advance`, `luca roadmap create`,
  `luca todo add`, etc. Citty supports nested `subCommands` (already used by
  `luca mcp serve`). ~7 noun groups, ~18 leaf commands.
- **D3 — Per-step artifact map: luca-core.** A `STEP_ARTIFACTS: Record<PipelineStep, …>`
  map (which artifact file each step legally produces) in
  `packages/luca-core/src/state/configs/`, beside `pipeline-transitions.ts`. The hook
  and the CLI both consult it. For CLI verbs, a companion `WRITE_COMMAND_PHASES` table
  maps verb → allowed `PipelineStep[]` (extracted from today's `allowedPhases`).
- **D4 — Result type: local, no SDK.** Replace `ToolResult = CallToolResult` (SDK) with a
  local `WriteResult = { ok: boolean; message: string; data?: unknown }`.
- **D5 — No MCP shim retained.** Phase E deletes MCP entirely. Re-adding a thin shim
  later is cheap (handlers stay neutral) — documented, not kept.
- **D6 — Atomicity.** CLI mutations keep `writeAtomicFile` (temp+rename). Artifact files
  written via the native `Write` tool are **not** atomic — acceptable: a torn markdown
  write is rare and git-recoverable, and the artifacts have no cross-file invariant.

## 5. Migration phases

Strangler-fig: after Phase A the MCP server and the new surface can coexist (both front
the same core). The pipeline keeps working via MCP until Phase D switches consumers, then
via the new surface. Each phase is independently committable and verifiable with
`bunx --bun tsc --noEmit`.

### Phase 0 — interim MCP unblock · SKIPPED

Decision: **skip.** The MCP write tools stay dead until Phase D; the migration is done
without running the pipeline (the `luca-executor` subagent has direct Edit/Write during
EXECUTING — the pipeline being down during its own rewrite is acceptable). The 10-line
`zodToInputSchema` fix is throwaway effort and is not applied.

### Phase A — Extract the deterministic core · size M · risk LOW

**Goal:** make the write logic runtime-agnostic and outside `src/mcp/`.

- Create `src/write-surface/` (new domain). Relocate via `git mv`:
  - `src/mcp/helpers/tools/*.ts` → `src/write-surface/handlers/*.ts` (27 files)
  - `src/mcp/helpers/{resolve-active-slug,write-atomic,build-muninn-instruction,validate-verification-ref}.ts` and `review-analysis/` → `src/write-surface/helpers/`
- Define `WriteResult` (D4) in `src/write-surface/__schemas/`; repoint each handler's
  `ToolResult` import to it (mechanical — same shape, drops the SDK import).
- Add `packages/luca-core/src/state/configs/step-artifacts.ts` — `STEP_ARTIFACTS` (D3)
  and `WRITE_COMMAND_PHASES`, extracted from each tool's current `allowedPhases`. Export
  from the luca-core barrel.
- Keep `src/mcp/` alive: `server-setup.ts` + `tool-registry.ts` import handlers from
  `src/write-surface/` and adapt `WriteResult` → `CallToolResult`. MCP still works.

**Verification:** `tsc` clean; smoke-test `luca mcp serve` still answers `initialize` + a
tool call. **Rollback:** revert the move commit.

### Phase B — Build the `luca` CLI · size M · risk MED

**Goal:** the CLI track — structured/operational mutations only (~18 commands; the 9
freeform artifact writes are handled by the Phase C hook change, not the CLI).

- Add noun-group commands to `src/cli.ts` `subCommands`: `state`, `roadmap`,
  `preferences`, `todo`, `pr-review`, `repo`, `checks`, `workflow`, `branch-guard`,
  `confidence`, plus the read commands (`phase current`, `state read`, …).
- New `src/commands/write-surface/<noun>.ts` per group — each a citty `defineCommand`
  with leaf `subCommands`. Each leaf: parse argv, read any payload from a flag or
  `--file`, call the `src/write-surface/` handler, print `WriteResult.message`, exit 0/1.
- Each leaf self-checks its phase precondition: read `.luca/state.json`, look up
  `WRITE_COMMAND_PHASES`, refuse with exit 1 + a clear message if out-of-phase.
- Strong `meta.description` + `args` on every command — the discoverability surface;
  treat `--help` text as a first-class deliverable.
- Create `skills/skills/luca-write-surface/SKILL.md` — `description` surfaces the
  capability; body documents every subcommand, the `Write`-to-canonical-path convention
  for artifacts, and the phase rules.

**Verification:** `tsc` clean; run each leaf in/out of its allowed phase against a temp
`.luca/`. **Rollback:** CLI is additive — revert; MCP still serves.

### Phase C — Stage-gate hook becomes the artifact-path gate · size M · risk MED-HIGH

**Goal:** the native `Write` tool becomes the safe channel for `.luca/` artifact files,
and `luca` CLI commands are recognised.

- `src/hook/helpers/handle-stage-gate-hook.ts`: when a `Write`/`Edit` targets a path
  under `.luca/phases/`, compute the legal artifact path(s) for the current
  `pipelineStep` (`resolveActiveSlug` + `phasePathFor` + `STEP_ARTIFACTS`). Allow **only**
  an exact match (audit paths matched by the existing `AUDIT_PATH_PATTERN`); block every
  other `.luca/` write — including all writes to `.luca/` root files (those go through
  the CLI).
- `src/hook/helpers/classify-bash-command.ts`: detect `luca` as command word; classify
  `luca <noun> <write-verb>` → a new `BashCategory 'luca-write'`, read verbs →
  `'bash-readonly'`. Guard precisely so only real `luca` verbs match.
- `luca-core`: add `ToolCategory 'luca-write'` + a `stage-tool-matrix.ts` row allowing it
  in all non-IDLE phases (the CLI self-enforces per-verb phase).
- Raw code writes and non-contract `.luca/` paths stay blocked (unchanged).

This is the heart of the new design and the highest-logic phase. **Verification:** extend
the existing classifier/hook checks — `Write` to `.luca/phases/<slug>/plan.md` allowed in
the `plan` step, the same write blocked in the `research` step; `Write` to
`.luca/state.json` always blocked; `luca state advance` classified `luca-write` and
allowed. **Rollback:** revert; until Phase D nothing depends on it.

### Phase D — Rewire Luca's skills/agents · size L · risk MED-HIGH

**Goal:** switch every consumer off the `luca_*` MCP tools.

- ~25 files in `packages/luca-framework/skills/` (hand-authored source, confirmed),
  ~100 reference sites. Counts: `lu.md` 11, `luca-verifier.md` 11, `luca-executor.md` 7,
  `lu-review.md` 6, etc.
- **Artifact-write references** (`luca_phase_write_plan`, …) → instruct the agent to use
  the **`Write` tool** to the canonical path (obtained from `luca phase current`).
- **Structured-mutation references** (`luca_state_advance`, `luca_todo_add`, …) → the
  `luca` CLI subcommand.
- Todo tools keep the `muninn_remember`/`muninn_recall` delegation pattern — only the
  entry point changes.

**Verification:** per-skill — run the pipeline step it drives end-to-end against a temp
project. Skill-by-skill; the pipeline is testable incrementally. **Rollback:** per-file.

### Phase E — Delete the MCP server · size S · risk LOW

- Delete `src/mcp/`, `src/commands/mcp.ts` (remove `mcp` from `src/cli.ts`),
  `src/init/helpers/wire-mcp-server.ts` (+ its call/import in `src/commands/init.ts`).
- Remove `@modelcontextprotocol/sdk` from `package.json` if unused elsewhere.
- Docs: update `AGENTS.md` ("Claude Code-first Architecture"), `CLAUDE.md`, and any
  `src/rules/` rule referencing the MCP write surface; drop the `claude mcp add` /
  `.mcp.json` guidance.

**Verification:** `tsc` clean; `grep -r "mcp" src/` surfaces nothing live; full pipeline
smoke run. **Rollback:** revert the deletion commit (handlers survive in `src/write-surface/`).

## 6. What is deleted / what survives

**Deleted:** `src/mcp/` transport shell, `src/commands/mcp.ts`, `wire-mcp-server.ts`, the
`@modelcontextprotocol/sdk` dependency, the `.mcp.json` / `claude mcp add` registration.

**Survives (relocated):** all structured-mutation handler bodies, their Zod schemas,
`phasePathFor` / `resolveActiveSlug` / `writeAtomicFile`, the per-step artifact map, the
muninn-delegation pattern. The `.luca/` directory contract is **untouched**.

## 7. Risks & open questions

- **OQ1 — content delivery — RESOLVED by direct testing.** The stage-gate classifier was
  run against every candidate form. `shell-quote.parse()` does not throw on heredocs —
  but the heredoc *body* is parsed as shell: a body line `echo hi > /etc/passwd` made the
  classifier extract `/etc/passwd` as a write target → the `luca phase write-plan`
  invocation would be **blocked** as a write to a denied path. `&&`, `rm`, `curl|bash` in
  body content similarly mis-tokenize into fake subcommands. Any mechanism that puts
  content in the Bash command string (heredoc, `--content`) is therefore unusable for
  arbitrary documents — and a dev-tooling repo's plans routinely *discuss* shell
  commands. **Resolution:** artifact files use the native `Write` tool (D1) — content
  never reaches the shell classifier; the hook (Phase C) is the gate.
- **OQ2 — RESOLVED.** `packages/luca-framework/skills/` is hand-authored source (`build`
  is `unbuild` → `dist/` only; nothing generates into `skills/`). Phase D edits it directly.
- **OQ3 — subagent phase-gating.** Subagents share the global `.luca/state.json`
  `pipelineStep`; confirm a subagent's `Write` is gated identically to the orchestrator's.
  Likely fine (the hook reads global state) — verify in Phase C.
- **R1 — Phases C + D are the risk.** C carries the most new logic (the artifact-path
  gate); D touches ~100 sites in orchestration logic. Mitigations: C has tight,
  enumerable test cases (one per step × artifact); D is done skill-by-skill with
  incremental testing.
- **R2 — verify.json has no write-time schema check.** Written via `Write`, it isn't
  Zod-validated at the boundary (a raw file write). Acceptable — Luca's own verifier
  produces it; a malformed file is a bug, not an attack. A PostToolUse validation hook
  can be added later if wanted.
- **R3 — discoverability is probabilistic.** Skill triggering is not deterministic.
  Mitigation: orchestrator skills name CLI subcommands / the `Write`-path convention
  directly in step instructions — deterministic for the scripted pipeline.

## 8. Effort & sequencing

`A → B → C → D → E`, strictly ordered (C can overlap late B; D needs B+C). Rough size:
A=M, B=M, C=M, D=L, E=S — a **single milestone** (~2 focused weeks, AI-assisted). The
pipeline is restored at the end of Phase D.

## 9. Decision log — what was not chosen

- **Mastra** — rejected. `@mastra/mcp` wraps the *same* `@modelcontextprotocol/sdk` Luca
  already uses; `createTool` drags in `@mastra/core` (~54 MB, ~35 deps). Mastra is built
  to own the agent loop; Claude Code *is* the loop. (Unrelated to `luca-mastracode`.)
- **Heredoc / stdin into the CLI** — rejected after OQ1 testing (§7). Content in the Bash
  command string is shell-parsed by the stage-gate classifier and mis-classified.
- **Single consolidated MCP meta-tool** — considered, not chosen. Keeps the resident
  subprocess, registration plumbing, and schema handshake, and costs tool-defs on Haiku.
- **A retained thin MCP shim** — not kept (D5); re-adding is cheap if ever needed.

## 10. References

Research synthesis (4 parallel agents, 2025–2026 sources) + OQ1 empirical testing of the
stage-gate classifier. Key citations:
- Anthropic, *Code execution with MCP* (Nov 2025) — present tools as a code API.
- Cloudflare, *Code Mode* (2025) — LLMs write code better than tool calls.
- The New Stack, *When Is MCP Actually Worth It?* (May 2026) — MCP not for deterministic local integrations.
- Verdent, *Claude Skills vs MCP* (2026) — "build everything as CLI + Skill first."
- Statewright — state-machine guardrails as hook-layer enforcement; "the guard validates, the agent proposes."
