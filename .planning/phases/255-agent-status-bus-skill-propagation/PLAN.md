---
phase: 255
plan: 1
type: improvement
autonomous: true
wave: 1
depends_on: []
---

# Phase 255 Plan 1: Agent Status Bus — Skill Name Propagation

## Objective

Ensure `.planning/.statusline.json` retains `skill: "lu"` throughout Agent()
execution so the statusline HUD shows "lu > {step}" instead of just "{step}".

The root cause is a two-part gap in `agent-status-sync.ts`:

1. `writeStatusBus` resets `existing` to `{}` when the bus is stale (>5 min),
   which causes the `skill` field written by `skill-status-enter` to vanish on
   the next Agent() call during a long-running phase.
2. When `agent-status-sync` fires before `skill-status-enter` has had a chance
   to run (e.g., at session start, or after a bus clear between phases), there
   is no fallback source for the skill name.

The fix uses two layers: an explicit pre-read that bypasses the stale TTL to
rescue the existing skill value, plus a sidecar file (`/tmp/lu-skill.txt`)
written by `skill-status-enter` as a durable fallback.

## Context

- `.planning/phases/255-agent-status-bus-skill-propagation/01-CONTEXT.md` —
  full root-cause analysis, gray area catalogue, and risk list
- `src/hooks/scripts/agent-status-sync.ts` — PreToolUse hook on Agent()
- `src/shared/__helpers/status-bus.ts` — `writeStatusBus` / `readStatusBus`
- `src/hooks/scripts/skill-status-enter.ts` — writes `skill` on Skill entry
- `src/shared/__schemas/status-bus.schemas.ts` — `StatusBusSchema` (skill
  defaults to `""`)

## Tasks

### 1. preserve-skill-field

**Type:** auto
**TDD:** false
**Depends on:** none

Modify `src/hooks/scripts/agent-status-sync.ts` to explicitly read the existing
bus for the `skill` value before calling `writeStatusBus`, bypassing the stale
guard by reading the raw file directly (not via `readStatusBus` which applies
the 5-minute TTL). Pass the rescued skill value in the write payload when
non-empty so it survives bus staleness.

Implementation steps:

1. Import `readStatusBus` from `../../shared` alongside the existing
   `writeStatusBus` import.
2. Inside `main()`, after resolving `matched` and `phase` but before calling
   `writeStatusBus`, add a try/catch block that calls `readStatusBus(busPath)`
   with a very high `maxAgeMs` (e.g. `Infinity` expressed as
   `Number.MAX_SAFE_INTEGER`) to bypass the stale check and read whatever skill
   is on disk.
3. Capture `existingSkill = (await readStatusBus(busPath, Number.MAX_SAFE_INTEGER))?.skill ?? ""`.
4. Include `...(existingSkill ? { skill: existingSkill } : {})` in the
   `writeStatusBus` payload so the merge overrides the schema default `""` with
   the persisted value.

Why bypass the stale guard here: the stale guard exists to prevent an old
skill name from bleeding into a brand-new invocation. But within a single
session, the skill name is authoritative until `skill-status-enter` explicitly
overwrites it. Reading without TTL for the purpose of skill preservation is
safe because `agent-status-sync` never writes a `skill` field of its own — it
can only echo what was already there.

**Files to create/edit:**

- `src/hooks/scripts/agent-status-sync.ts`

**Verification:**

- TypeScript compiles without errors (`bunx --bun tsc --noEmit`)
- The payload object passed to `writeStatusBus` now conditionally includes
  `skill` when the existing bus has a non-empty value
- No other call sites or exports changed

---

### 2. fallback-skill-from-context

**Type:** auto
**TDD:** false
**Depends on:** 1

Add a sidecar file mechanism (`/tmp/lu-skill.txt`) as a durable fallback for
when the bus has been cleared or was never written.

The discussion context (section 5, gray area 1) notes that
`/tmp/lu-context.json` has no `skill_name` field, making it unsuitable as a
fallback source without a schema change. The sidecar approach (Option C from
the discussion) requires only two small changes and avoids any schema churn.

**In `skill-status-enter.ts`:**

After the existing `writeStatusBus` call, write the skill name to
`/tmp/lu-skill.txt` using `Bun.write`. This persists across bus clears and
lives as long as the session.

```ts
// Persist skill name as durable fallback for agent-status-sync
await Bun.write("/tmp/lu-skill.txt", skillName).catch(() => {});
```

**In `agent-status-sync.ts`:**

After Task 1's explicit bus read (which already rescues the skill when the bus
is fresh), add a second fallback: if `existingSkill` is still empty, try to
read `/tmp/lu-skill.txt` using `Bun.file(...).text()`. This covers the case
where the bus was cleared but the sidecar still holds the value.

```ts
if (!existingSkill) {
  try {
    const sidecar = Bun.file("/tmp/lu-skill.txt");
    if (await sidecar.exists()) {
      const txt = (await sidecar.text()).trim();
      if (txt && /^[a-z0-9-]+$/.test(txt)) existingSkill = txt;
    }
  } catch {
    // ignore
  }
}
```

The regex guard on the sidecar value prevents injection of unexpected strings.

**Files to create/edit:**

- `src/hooks/scripts/skill-status-enter.ts`
- `src/hooks/scripts/agent-status-sync.ts`

**Verification:**

- TypeScript compiles without errors
- `skill-status-enter.ts` writes `/tmp/lu-skill.txt` alongside the bus write
- `agent-status-sync.ts` falls through to the sidecar when the bus has no skill
- `/tmp/lu-skill.txt` written value passes the alphanumeric kebab-case guard
  before being used

---

## Verification

- [ ] `bunx --bun tsc --noEmit` passes with zero errors
- [ ] `agent-status-sync.ts` imports `readStatusBus` from `../../shared`
- [ ] `agent-status-sync.ts` includes `skill` in the `writeStatusBus` payload
      when either the existing bus or the sidecar file provides a non-empty value
- [ ] `skill-status-enter.ts` writes `/tmp/lu-skill.txt` after each Skill entry
- [ ] Neither hook calls `Agent()`, `Skill()`, or any external process
- [ ] All try/catch blocks wrap file I/O so failures remain silent (exit 0)
- [ ] No changes to `status-bus.ts`, `StatusBusSchema`, or any shared exports

## Success Criteria

After these changes, a full `/lu` run that spawns Agent() workers at any point
in the pipeline will show `skill: "lu"` in `.planning/.statusline.json` for the
duration of that run. The statusline HUD will render "lu > {step}" rather than
just "{step}".

Edge cases covered:

- Long phase (>5 min) that triggers the stale guard: Task 1 explicit-read with
  high TTL rescues skill before it can be lost.
- Session where hooks weren't active at Skill entry, or bus was cleared between
  phases: Task 2 sidecar fallback provides the skill name.
- Parallel Agent() calls during code review wave: both reads see the same
  sidecar value; last write wins, but both write `skill: "lu"` — correct outcome.

## Output Specification

Two modified TypeScript hook source files:

- `src/hooks/scripts/agent-status-sync.ts`
- `src/hooks/scripts/skill-status-enter.ts`

No new files, no schema changes, no new exports from shared. The generated
outputs in `dist/` are rebuilt by `bun run build:all` (done manually outside
the session per project convention).
