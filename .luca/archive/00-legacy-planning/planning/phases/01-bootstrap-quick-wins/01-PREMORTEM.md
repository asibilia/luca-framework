# Phase 1: Pre-Mortem Risk Brief

## Risk Scenarios

### 1. Stale localStorage Keys Survive Rename (HIGH likelihood, MEDIUM impact)

**What fails:** `layout.tsx`, `stores/vault.ts`, and `stores/theme.ts` contain hardcoded `"luca-observer-*"` localStorage key strings. These are invisible to TypeScript type checking and may survive a bulk find/replace targeting import paths.

**Mitigation:** Before find/replace, run explicit grep sweep: `grep -rn "luca-observer" packages/luca-observer/ --include="*.ts" --include="*.tsx"` and treat ALL hits as required changes.

**Detection:** Post-rename: `grep -rn '"luca-observer' packages/luca-studio/` — any hit outside `.next/` is a missed reference.

### 2. validate() Breaks Adapter Type Contract (MEDIUM likelihood, HIGH impact)

**What fails:** Adding required `validate()` to the Adapter interface blocks tsc on all adapters until all three implementations complete. Adding it without the interface means runtime-only existence.

**Mitigation:** Declare `validate?` as OPTIONAL on the Adapter type (matching `compileRule?` and `executeStep?` precedent) BEFORE touching any adapter file. Commit schema file independently first.

**Detection:** `bunx --bun tsc --noEmit` after each file change.

### 3. Compiled .claude/ Skills Stale After Audit (HIGH likelihood, MEDIUM impact)

**What fails:** Audit fixes land in `src/skills/` but `.claude/` compiled output remains stale until `bun run build:all` is run outside the session. Follow-on sessions execute OLD prompts.

**Mitigation:** Post-phase user action notice: `bun run build:all` outside Claude Code session. Run `bun run check:drift` before Phase 2.

**Detection:** `bun run check:drift` — clean exit confirms `.claude/` matches `src/`.

## Plan Constraints

1. Grep sweep for ALL "luca-observer" string literals before bulk find/replace
2. Declare `validate?` as optional on Adapter type as first adapter-report step
3. Phase not complete until user confirms `bun run build:all` succeeded outside session
