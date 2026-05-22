# v13 Write-Surface Re-Architecture — Migration Record

> Status: **COMPLETED.** Planned and executed in five phases (A–E), merged in PR #266
> (commit `ec56f6da3`) and shipped in `@alecsibilia/luca-framework@12.0.0-alpha.15`.
> This document is the migration's planning record — the design as planned, with each
> phase marked done inline. Scope was the write-surface layer only. Content delivery
> was settled during planning by the OQ1 research in §7: artifact files route through
> the agent's native `Write` tool, not a CLI heredoc.

## 1. Decision

Replaced the 27-tool **MCP server** with a two-track write surface, both enforced by the
stage-gate hook:

- **Freeform artifact files** (plan, research, context, plan-review, summary, wave,
  audit, learn, verify.json) — written with the agent's **native `Write` tool** to the
  canonical path; the stage-gate hook validates the path is exactly the legal artifact
  for the current `pipelineStep`.
- **Structured / operational mutations** (state, roadmap, preferences, todo, checks,
  pr-review, repo-cleanup, workflow, branch-guard, confidence) — a typed **`luca` CLI**,
  invoked via Bash, small flag/`--file` payloads.

Not Mastra. The MCP server was deleted.

Rationale (research synthesis, §10): MCP is a protocol for reaching *external* systems;
Luca's write surface is a subprocess of the harness mutating files in the harness's own
repo — the wrong layer. A CLI surface has zero standing token cost on every model tier
(MCP Tool Search is disabled on Haiku — exactly where Luca runs cheap agents), is
in-distribution for the model, and removed an entire class of transport bugs (three were
hit during planning: wrong-file registration, the `zodToInputSchema` stub, the schema
handshake). The migration was low-risk because the tool handlers were *already*
runtime-agnostic (§2) — the MCP layer was a thin transport shell.

## 2. Starting architecture (before v13)

```
Claude Code agent
  │  calls mcp__luca__luca_phase_write_plan({content})
  ▼
luca mcp serve  (subprocess, src/commands/mcp.ts)
  └─ createLucaMcpServer  (src/mcp/helpers/server-setup.ts)
       ├─ ListTools  ← zodToInputSchema (STUB — returned an empty schema)
       └─ CallTool   → phase-precondition check (allowedPhases)
                     → tool.handler(args, {cwd})  → ToolResult
```

The handlers were already runtime-agnostic: `lucaPhaseWritePlanTool.handler` took plain
`(args, { cwd })`, returned a plain result, and imported only runtime-neutral helpers
(`phasePathFor` from luca-core, `resolveActiveSlug`, `writeAtomicFile`, `loadCurrentState`)
plus a Zod schema. The *only* MCP-coupled things were the `ToolResult` type alias (= SDK
`CallToolResult`) and the `ToolDescriptor` wrapper — so the handlers could relocate and
only the transport had to change.

Two enforcement facts that shaped the design:
- The stage-gate hook did **not** see MCP tool calls — `mcp__luca__*` calls hit the
  hook's "not write-class — allowing" branch. The *MCP server itself* enforced the
  per-verb phase precondition (`allowedPhases`). With MCP gone, that precondition needed
  a new home.
- The hook *does* classify `Bash` and `Write`/`Edit`. For `Write`/`Edit` it inspects
  `tool_input.file_path` only — never the content. For `Bash` it runs `classifyBashCommand`
  on the whole command string. This asymmetry was decisive — see OQ1 (§7).

## 3. The v13 architecture — two tracks, one guard

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
| **1 — Deterministic core** | Runtime-agnostic: canonical path computation, the per-step legal-artifact map, Zod validation for structured payloads, atomic write helper. Zero LLM judgment. | `src/write-surface/` + `luca-core` `state/configs/` |
| **2 — Stage-gate hook = the artifact-path gate** | For a `Write`/`Edit` under `.luca/phases/`: compute the legal artifact path for the current `pipelineStep` and allow **only** an exact match — this makes the native `Write` tool the safe content channel. Recognise `luca` CLI commands and let them through. Block raw writes to `.luca/` root files and to code. | `src/hook/helpers/*`, `luca-core` `state/configs/` |
| **3 — `luca` CLI** | `luca <noun> <verb> --flags` — ~18 commands for structured/operational mutations only (artifact files do **not** get a CLI command). Sharing Layer 1. Discovery via the `luca-write-surface` skill + `--help` + orchestrator skills naming subcommands directly. | `src/commands/…`, `src/cli.ts`, `skills/skills/luca-write-surface/` |

**Why two tracks.** OQ1 research (§7) proved that putting freeform content inside a Bash
command string is unworkable — the stage-gate classifier parses the whole string as
shell, so document content gets mis-tokenized. The native `Write` tool carries content
in a structured field the hook never shell-parses. So: freeform artifacts → `Write`;
structured mutations (small payloads) → CLI. This also halved the CLI surface (~18 vs 27).

**Path safety is preserved.** The agent *proposes* a path; the hook *computes* the
canonical path for the current step and rejects anything else — "propose + verify", the
validation-at-boundary pattern (§10). `.luca/` root files (`state.json`, `config.json`,
`roadmap.md`, `ledger.jsonl`) are never written by a raw `Write`; they are mutated only
through the `luca` CLI, which applies validated transitions.

## 4. Design decisions

- **D1 — Content delivery (see OQ1, §7).** Freeform artifact files are written with the
  agent's native `Write` tool to the canonical path; content travels in `Write`'s
  structured `content` field and never touches the shell. Structured/operational
  mutations use the `luca` CLI with flags or `--file`. Heredoc / `--content` were
  rejected — they route content through the shell classifier.
- **D2 — CLI shape: noun/verb.** `luca state advance`, `luca roadmap create`, etc.
  Citty nested `subCommands`. ~11 noun groups, 18 leaf commands.
- **D3 — Per-step artifact map in luca-core.** `STEP_ARTIFACTS` (which artifact file each
  step legally produces) beside `pipeline-transitions.ts`; the hook and the CLI both
  consult it. A companion `WRITE_COMMAND_PHASES` maps verb → allowed `PipelineStep[]`.
- **D4 — Result type: local, no SDK.** Replaced `ToolResult = CallToolResult` (SDK) with
  a local `WriteResult`.
- **D5 — No MCP shim retained.** Phase E deleted MCP entirely; re-adding a thin shim
  later is cheap (handlers stay neutral).
- **D6 — Atomicity.** CLI mutations keep `writeAtomicFile` (temp+rename). Artifact files
  written via the native `Write` tool are not atomic — accepted: a torn markdown write is
  rare and git-recoverable, and the artifacts have no cross-file invariant.

## 5. Migration phases

Strangler-fig: after Phase A the MCP server and the new surface coexisted (both fronting
the same core); the pipeline kept working via MCP until Phase D switched consumers. Each
phase was verified with `bunx --bun tsc --noEmit`. Merged as PR #266.

### Phase 0 — interim MCP unblock · ✅ SKIPPED (deliberate)

Skipped by decision. The MCP write tools stayed dead until Phase D; the migration was
done without running the pipeline (the `luca-executor` subagent has direct Edit/Write
during EXECUTING, so the pipeline being down during its own rewrite was acceptable). The
10-line `zodToInputSchema` fix was throwaway effort and was not applied.

### Phase A — Extract the deterministic core · ✅ DONE

Created the `src/write-surface/` domain. Relocated via `git mv`: the 27 tool handlers
(`src/mcp/helpers/tools/*.ts` → `src/write-surface/handlers/`) and the shared helpers
(`resolve-active-slug`, `resolve-repo-vault`, `write-atomic`, `build-muninn-instruction`,
`validate-verification-ref`, `review-analysis/`). Defined a local `WriteResult` (D4),
dropping the `@modelcontextprotocol/sdk` type coupling from the handlers. Added
`packages/luca-core/src/state/configs/step-artifacts.ts` — `STEP_ARTIFACTS` and
`WRITE_COMMAND_PHASES`, derived from each tool's `allowedPhases`. `src/mcp/` kept working
(`server-setup.ts` + `tool-registry.ts` imported handlers from the new location). `tsc`
clean; the MCP server smoke-tested (27 tools).

### Phase B — Build the `luca` CLI · ✅ DONE

Built the CLI track — structured/operational mutations only (18 commands across 11 noun
groups; the 9 freeform artifact writes got no CLI command). Added noun-group commands to
`src/cli.ts`; one `src/commands/write-surface/<noun>.ts` per group, each a citty
`defineCommand` with leaf `subCommands`. Each leaf parses argv, reads any payload from a
flag or `--file`, calls the `src/write-surface/` handler, and self-checks its phase
precondition via `WRITE_COMMAND_PHASES`. A step-0 move relocated `loadCurrentState` /
`loadCurrentConfig` into luca-core (resolving an upward-tier dependency from
write-surface). Created `skills/skills/luca-write-surface/SKILL.md` — the discovery
skill. `tsc` clean; CLI smoke-tested.

### Phase C — Stage-gate hook becomes the artifact-path gate · ✅ DONE

The highest-logic phase. `handle-stage-gate-hook.ts` gained the artifact-path gate: a
`Write`/`Edit` under `.luca/phases/` is allowed only when the path is exactly the legal
artifact for the current `pipelineStep` (computed from `STEP_ARTIFACTS` + `phasePathFor`;
audits matched by `AUDIT_PATH_PATTERN`), short-circuiting before the coarse matrix; every
other `.luca/` write is blocked, including `.luca/` root files. `classify-bash-command.ts`
gained recognition of `luca <noun> <verb>` commands (new `BashCategory 'luca-write'`).
luca-core gained a `ToolCategory 'luca-write'` + a matrix row; `resolveActiveSlug` moved
into luca-core. IDLE stayed permissive; EXECUTING still allowed code writes. `tsc` clean;
18/18 behavioral smoke tests passed.

### Phase D — Rewire Luca's skills/agents · ✅ DONE

Rewired ~24 skill/agent files (~93 reference sites) in `packages/luca-framework/skills/`
off the `luca_*` MCP tools: the 9 freeform artifact writes became native `Write`-to-
canonical-path instructions; the 18 structured tools became `luca` CLI calls; the
`muninn_remember`/`muninn_recall` delegation pattern was left intact. The
`luca-write-surface` skill gained its artifact-`Write` section. Zero residual `luca_*`
tool references; `tsc` clean.

### Phase E — Delete the MCP server · ✅ DONE

Deleted `src/mcp/`, `src/commands/mcp.ts` (and the `mcp` entry in `src/cli.ts`),
`src/init/helpers/wire-mcp-server.ts` (+ its call in `src/commands/init.ts`), and the
`@modelcontextprotocol/sdk` dependency. Updated `AGENTS.md`, `CLAUDE.md`,
`docs/getting-started.md`, and the `luca-init` skill to describe the v13 surface. The 27
tool handlers survived in `src/write-surface/`. `tsc` clean; no live MCP references
remained.

## 6. What was deleted / what survived

**Deleted:** `src/mcp/` transport shell, `src/commands/mcp.ts`, `wire-mcp-server.ts`, the
`@modelcontextprotocol/sdk` dependency, the `.mcp.json` / `claude mcp add` registration.

**Survived (relocated):** all structured-mutation handler bodies, their Zod schemas,
`phasePathFor` / `resolveActiveSlug` / `writeAtomicFile`, the per-step artifact map, the
muninn-delegation pattern. The `.luca/` directory contract was untouched — no artifact
migration was required.

## 7. Risks & open questions (as resolved)

- **OQ1 — content delivery — resolved by direct testing.** The stage-gate classifier was
  run against every candidate form. `shell-quote.parse()` does not throw on heredocs —
  but the heredoc *body* is parsed as shell: a body line `echo hi > /etc/passwd` made the
  classifier extract `/etc/passwd` as a write target, so the `luca phase write-plan`
  invocation would have been blocked as a write to a denied path. Any mechanism that puts
  content in the Bash command string (heredoc, `--content`) is unusable for arbitrary
  documents. Resolution: artifact files use the native `Write` tool (D1).
- **OQ2 — resolved.** `packages/luca-framework/skills/` is hand-authored source (`build`
  is `unbuild` → `dist/` only; nothing generates into `skills/`). Phase D edited it
  directly.
- **OQ3 — subagent phase-gating.** Subagents share the global `.luca/state.json`
  `pipelineStep`; a subagent's `Write` is gated identically to the orchestrator's because
  the hook reads global state regardless of caller. Held true.
- **R1 — Phases C + D were the risk** (most new logic; ~93 rewired sites). Mitigated by
  tight per-step test cases (C) and skill-by-skill rewiring (D). No regressions surfaced.
- **R2 — verify.json has no write-time schema check.** Written via `Write`, it is not
  Zod-validated at the boundary. Accepted — Luca's own verifier produces it; a malformed
  file is a bug, not an attack. A PostToolUse validation hook can be added later.
- **R3 — discoverability is probabilistic.** Skill triggering is not deterministic.
  Mitigated: orchestrator skills name CLI subcommands / the `Write`-path convention
  directly in step instructions.

## 8. Effort & sequencing (as executed)

`A → B → C → D → E`, in order (C overlapped late B; D needed B + C). Run as a single
milestone; the pipeline was restored at the end of Phase D. Merged in PR #266. As a
follow-on, `luca doctor` gained a check that flags a stale `luca mcp serve` registration
left by a pre-v13 `luca init` (fix: `claude mcp remove luca`).

## 9. Decision log — what was not chosen

- **Mastra** — rejected. `@mastra/mcp` wraps the *same* `@modelcontextprotocol/sdk` Luca
  already used; `createTool` drags in `@mastra/core` (~54 MB, ~35 deps). Mastra is built
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
