---
phase: 3
plan: 2
type: feature
autonomous: false
wave: 1
depends_on: []
---

# Phase 3 Plan 2: Compilation Sidecar

## Objective

Build a standalone Bun process on TCP localhost:3457 that exposes per-entity incremental compilation via HTTP, enabling Luca Studio to compile individual agents, skills, and rules without invoking `bun run build:all` (which crashes Claude Code sessions).

> Appetite: Large (200000 tokens remaining of 200000 ceiling)

## Context

@.planning/phases/03-w2-high-risk-infrastructure/03-CONTEXT.md
@.planning/todos/pending/studio-w2-compilation-sidecar.md
@docs/brainstorm/observer-studio-rework/4.technical-architecture.md (Compilation Problem section)
@docs/brainstorm/observer-studio-rework/6.research-architecture.md (R2)
@src/compilers/\_\_helpers/compile.ts
@scripts/build-shared.ts (generateAgentOutputs, generateSkillOutputs, generateRuleOutputs reference)
@src/agents/index.ts (agentRegistry)
@src/skills/index.ts (skillRegistry)
@src/rules/index.ts (ruleRegistry)

## Tasks

### 1. Create the sidecar server with Bun.serve()

**Type:** auto
**TDD:** false
**Depends on:** none

Create `packages/luca-studio/sidecar/compiler.ts` — a standalone Bun process that listens on TCP localhost:3457 using `Bun.serve()`.

Endpoints:

- `GET /health` — returns `{ status: "ok", uptime_ms: number }` for readiness checks
- `POST /compile` — accepts `{ domain: "agents" | "skills" | "rules", name: string }`, compiles the entity, writes output to the appropriate path, and returns `{ status: "compiled", output_path: string, duration_ms: number }` or `{ status: "error", error: string, duration_ms: number }`

Implementation details:

- Use `Bun.serve()` with `port: 3457` (not Express, not Unix sockets)
- Port conflict detection: catch `EADDRINUSE` and log a clear error message with the port number and PID of the conflicting process if possible
- Import registries lazily: `agentRegistry`, `skillRegistry`, `ruleRegistry` from `src/` (the sidecar IS a Bun process in the monorepo, so tsconfig aliases resolve naturally)
- Import compile functions: `compileAgent`, `compileSkill`, `compileRule` from `src/compilers/__helpers/compile.ts`
- Validate request body with Zod schema (`CompileRequestSchema`)
- CORS: not needed (same-origin calls from Next.js API routes on localhost)
- MUST NEVER invoke `bun run build:all` — only per-entity compilation

Per-entity compilation flow:

1. Look up entity in the appropriate registry by name
2. Instantiate the entity factory function: `registry[name]()`
3. Call the appropriate compile function: `compileAgent(instance, "CLAUDE")`
4. Write output to the correct path (e.g., `.claude/agents/{name}.md`)
5. Return the output path and timing

**Files to create/edit:**

- `packages/luca-studio/sidecar/compiler.ts` (new)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Server starts without errors: `bun packages/luca-studio/sidecar/compiler.ts`
- `curl http://localhost:3457/health` returns 200 with JSON

### 2. Implement the /compile endpoint logic

**Type:** auto
**TDD:** false
**Depends on:** 1

Wire up the per-entity compilation logic inside the `POST /compile` handler.

Domain-to-registry mapping:

- `agents` -> `agentRegistry` from `src/agents/index.ts`, compile with `compileAgent()`, output to `.claude/agents/{name}.md`
- `skills` -> `skillRegistry` from `src/skills/index.ts`, compile with `compileSkill()`, output to `.claude/skills/{name}/SKILL.md`
- `rules` -> `ruleRegistry` from `src/rules/index.ts`, compile with `compileRule()`, output to `.claude/rules/{name}.md`

Error handling:

- Invalid domain: return 400 with `{ status: "error", error: "Invalid domain: {value}. Must be agents, skills, or rules." }`
- Unknown entity name: return 404 with `{ status: "error", error: "{domain}/{name} not found in registry" }`
- Compilation failure: return 500 with `{ status: "error", error: string, duration_ms: number }`
- Invalid JSON body: return 400 with parse error
- Missing required fields: return 422 with Zod validation errors

Ensure the output directory exists before writing (use `Bun.file()` and `Bun.write()` for atomic writes). Create parent directories with `mkdir -p` equivalent if needed.

**Files to create/edit:**

- `packages/luca-studio/sidecar/compiler.ts` (extend)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `curl -X POST http://localhost:3457/compile -H 'Content-Type: application/json' -d '{"domain":"agents","name":"lu-router"}'` returns success JSON
- Output file appears at `.claude/agents/lu-router.md`

### 3. Add request validation schema and error boundaries

**Type:** auto
**TDD:** false
**Depends on:** 2

Create a Zod schema for compile request validation and wrap all handler logic in proper error boundaries.

Schema:

```
CompileRequestSchema = z.object({
  domain: z.enum(["agents", "skills", "rules"]),
  name: z.string().min(1),
  format: z.enum(["CLAUDE", "PLUGIN"]).default("CLAUDE"),
})
```

Error boundaries:

- Catch uncaught exceptions in the request handler — return 500 with structured error, never crash the server
- Log errors to stderr with timestamp for debugging
- Request timeout: if compilation takes >30 seconds, abort and return 504

**Files to create/edit:**

- `packages/luca-studio/sidecar/compiler.ts` (extend)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Invalid requests return proper 400/422 status codes
- `curl -X POST http://localhost:3457/compile -d 'not json'` returns 400
- `curl -X POST http://localhost:3457/compile -H 'Content-Type: application/json' -d '{"domain":"invalid","name":"x"}'` returns 400

### 4. Add dev script and package.json integration

**Type:** auto
**TDD:** false
**Depends on:** 3

Add the sidecar to the luca-studio dev workflow:

1. Add `sidecar:dev` script to `packages/luca-studio/package.json`: `bun run --watch sidecar/compiler.ts`
2. Update the `dev` script to start the sidecar alongside Next.js and CSS watcher: `bun run sidecar:dev & bun run css:watch & next dev --port 3456`
3. Add a `sidecar:start` script for non-dev usage: `bun sidecar/compiler.ts`

The `bun run --watch` flag provides automatic restart when sidecar source changes during development.

**Files to create/edit:**

- `packages/luca-studio/package.json` (edit scripts section)

**Verification:**

- `bun run --filter @alecsibilia/luca-studio sidecar:dev` starts the sidecar with watch mode
- `bun run --filter @alecsibilia/luca-studio sidecar:start` starts the sidecar without watch mode
- `bunx --bun tsc --noEmit` passes

### 5. Smoke test verification — curl-based end-to-end

**Type:** checkpoint:human-verify
**TDD:** false
**Depends on:** 4

Run the full smoke test suite using curl against the running sidecar:

1. **Start sidecar:** `bun packages/luca-studio/sidecar/compiler.ts`
2. **Health check:** `curl http://localhost:3457/health` — expect 200 with `{ status: "ok" }`
3. **Compile agent:** `curl -X POST http://localhost:3457/compile -H 'Content-Type: application/json' -d '{"domain":"agents","name":"lu-router"}'` — expect 200 with `{ status: "compiled", output_path: ".claude/agents/lu-router.md", duration_ms: N }`
4. **Compile skill:** `curl -X POST http://localhost:3457/compile -H 'Content-Type: application/json' -d '{"domain":"skills","name":"lu"}'` — expect 200 with compiled output
5. **Compile rule:** `curl -X POST http://localhost:3457/compile -H 'Content-Type: application/json' -d '{"domain":"rules","name":"bun-preference"}'` — expect 200 with compiled output
6. **Invalid domain:** `curl -X POST http://localhost:3457/compile -H 'Content-Type: application/json' -d '{"domain":"invalid","name":"x"}'` — expect 400
7. **Unknown entity:** `curl -X POST http://localhost:3457/compile -H 'Content-Type: application/json' -d '{"domain":"agents","name":"nonexistent"}'` — expect 404
8. **Invalid JSON:** `curl -X POST http://localhost:3457/compile -d 'not json'` — expect 400
9. **Verify output exists:** confirm `.claude/agents/lu-router.md` was written and is non-empty
10. **Port conflict:** start a second instance and confirm clear error message

**Files to create/edit:**

- None (verification only)

**Verification:**

- All 10 smoke tests pass
- Sidecar process does not crash on any error case
- Compiled output matches what `bun run build:all` would produce for the same entity

## Verification

1. `bunx --bun tsc --noEmit` passes for all new/modified files
2. All curl smoke tests pass (health, compile agent/skill/rule, error cases)
3. Sidecar NEVER invokes `bun run build:all` — confirmed by code review
4. Port conflict produces clear error message (not silent hang or crash)
5. Compiled output for a sample agent is byte-identical to what the full build pipeline produces

## Success Criteria

- Sidecar starts cleanly on localhost:3457 with `Bun.serve()`
- `POST /compile` compiles individual entities in <500ms
- `GET /health` returns uptime for readiness checking
- All error cases return structured JSON with appropriate HTTP status codes (400, 404, 500)
- Dev workflow integration: `bun run --watch` provides auto-restart on source changes
- Output matches full build pipeline output (byte-identical for sampled entities)

## Output Specification

- `packages/luca-studio/sidecar/compiler.ts` — Standalone Bun sidecar server
- `packages/luca-studio/package.json` — Updated with sidecar scripts
