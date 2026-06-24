# Phase 3: W2 HIGH-Risk Infrastructure — Context

## Decisions

### 1. TypeScript Round-Trip Read Path [from brainstorm R3]

**Decision:** Use targeted regex to extract the config object literal from the `create{Agent|Skill|Rule}()` call in each entity file. Parse the extracted literal with the appropriate Zod schema (AgentConfigSchema, SkillConfigSchema, RuleConfigSchema). The `.config` getter already on every entity provides the parsed config at runtime — the read path mirrors this but at the source-text level.

Research R3 confirmed all 129 entity files follow a canonical template with zero structural deviations. The read path targets the `createAgent({...})` / `createSkill({...})` / `createRule({...})` pattern.

### 2. TypeScript Round-Trip Write Path [from brainstorm R3]

**Decision:** Serialize the config object back to TypeScript object literal syntax, inject into the canonical template, and write the file. The `serializeSectionContent()` function must handle:

- Backtick template literals (prompt sections contain multiline strings)
- Escape `${}` sequences in template literals
- Preserve `${CONSTANT}` interpolation in 8 agents that use shared prompt blocks (COLD*ISOLATION_BLOCK, RESEARCH_REVIEWER*\*)
- Distinguish `${SHARED_BLOCK}` (preserve) from `${user_text}` (escape)

### 3. Compilation Sidecar Design [from brainstorm R2]

**Decision:** Standalone Bun process on localhost:3457 that:

- Imports `compileAgent`, `compileSkill`, `compileRule` from `src/compilers/__helpers/compile.ts`
- Exposes `POST /compile` accepting `{ domain, name }` body
- Returns `{ status, output_path, duration_ms }` or error
- Uses `Bun.serve()` (not Express)
- MUST NEVER invoke `bun run build:all` (crashes Claude Code sessions)
- Port conflict detection with clear error message
- Managed by `bun run --watch` in dev

### 4. Round-Trip Verification Gate [pre-mortem]

**Decision:** Mandatory verification: read all 129 entity files → serialize → write to temp → diff against original. Zero diffs required. This is the acceptance gate — without it, the feature is not shippable. The 8 interpolation agents need individual diff review.

## Phase Constraints

- ts-round-trip and compilation-sidecar are architecturally independent — can be developed in parallel sub-waves
- Both HIGH risk — Full verification mode
- ts-round-trip reads from T2 entity schemas (cross-package, not a tier violation since it lives outside src/)
- sidecar imports from T3 compilers (cross-package bridge, intentional)
- Post-phase: sidecar must be testable via curl
