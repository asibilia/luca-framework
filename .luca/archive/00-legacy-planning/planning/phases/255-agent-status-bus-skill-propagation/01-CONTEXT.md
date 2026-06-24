# Phase 255 — Agent Status Bus: Skill Name Propagation

## Discussion Context

---

## 1. Current Behavior (Root Cause Analysis)

### What `writeStatusBus` actually does

`src/shared/__helpers/status-bus.ts` — `writeStatusBus` already performs a **merge**:

```ts
const merged = {
  ...existing, // ← reads the bus file first
  ...data, // ← new partial data overwrites only what's provided
  updated_at: new Date().toISOString(),
};
```

This means `agent-status-sync` does NOT naively overwrite the `skill` field — it is correctly spread-merged with whatever is in the existing bus. The merge is conditional: if the existing bus is **older than 5 minutes**, `existing` is set to `{}` (stale guard), which causes the `skill` field to be lost.

### Why `skill` ends up empty

The current `.planning/.statusline.json` shows `"skill": ""`, which reveals the actual problem:

1. `skill-status-enter` fires on `Skill` tool invocations and writes `{ skill: skillName, stage: "EXECUTING" }`.
2. Between the `Skill` invocation and the first `Agent()` call inside that skill, the bus can be cleared or reset — e.g., if `writeStatusBus` is called with a freshly-initialized payload that omits `skill`.
3. More commonly: the `Skill` tool is invoked and `skill-status-enter` fires correctly. However, if the statusline bus is **not yet initialized** (first run, or cleared by a previous `clearStatusBus`), the `existing` read returns `{}`, and subsequent `agent-status-sync` writes preserve the skill fine.
4. The real observed problem is the **session start state**: if `skill-status-enter` never fires (because the orchestrating skill was invoked before hooks were active, or the bus was cleared between phases), then `agent-status-sync` writes with `skill` defaulting to `""` (the Zod schema default).

### Code path that causes the gap

`StatusBusSchema` defines `skill: z.string().default("")`. When `agent-status-sync` writes:

```ts
await writeStatusBus(
  {
    step: matched.step,
    wave_current: matched.position,
    wave_total: LU_PIPELINE_TOTAL,
    stage: "EXECUTING",
    ...(phase !== undefined && { phase }),
  },
  busPath,
);
```

It does NOT include a `skill` field in the payload. `writeStatusBus` reads `existing` and merges — so if `existing.skill` is `"lu"`, the merged result preserves it. **The merge IS working correctly.**

The gap occurs when:

- `existing` is `{}` (bus cleared, stale, or never written), AND
- `agent-status-sync` fires before `skill-status-enter` has had a chance to run

This happens when an `Agent()` call fires **without** a preceding `Skill()` call in the same session (e.g., the orchestrator directly spawns agents).

---

## 2. Exact Changes Required

### Task 1: `preserve-skill-field` — agent-status-sync.ts

The comment on line 136-138 of `agent-status-sync.ts` says:

> "Write to status bus — merges with existing data (preserves skill name written by skill-status-enter, overrides step + progress)"

This is aspirationally correct but fails when the bus is cleared/stale. The fix: **explicitly read the existing bus before writing and pass the skill value forward in the payload** when the incoming payload does not include one.

```ts
// Read existing skill name before writing (preserves skill across agent transitions)
let existingSkill: string | undefined;
try {
  const existingBus = await readStatusBus(busPath);
  existingSkill = existingBus?.skill ?? undefined;
} catch {
  /* ignore */
}

await writeStatusBus(
  {
    ...(existingSkill ? { skill: existingSkill } : {}),
    step: matched.step,
    wave_current: matched.position,
    wave_total: LU_PIPELINE_TOTAL,
    stage: "EXECUTING",
    ...(phase !== undefined && { phase }),
  },
  busPath,
);
```

However — this is **redundant** given the existing merge in `writeStatusBus`. The real fix is to ensure `skill-status-enter` runs reliably. The simpler, safer approach is to add a **read of `/tmp/lu-context.json` for the active skill name** when the existing bus has no `skill`.

### Task 2: `fallback-skill-from-context` — infer skill from lu-context.json

**Gray area**: `LuContextSchema` at `/tmp/lu-context.json` does NOT contain a `skill_name` field. The schema only tracks sub-agent outputs (`lu_route`, `lu_configure`, `lu_backlog`, `lu_phase_loop`). There is currently no field to infer the active skill from.

Options:

- **Option A**: Add a `skill_name` field to `LuContextSchema` and have `lu.skill.ts` write it during initialization. This is clean but requires a schema change + lu.skill.ts update.
- **Option B**: Infer from the existence of `/tmp/lu-context.json` alone (i.e., if the file exists, assume skill = "lu"). This is fragile but avoids schema changes.
- **Option C**: Use a separate sidecar file (e.g., `/tmp/lu-skill.txt`) written by `skill-status-enter` and read by `agent-status-sync` as fallback. Minimal change, no schema churn.

**Recommendation**: Option A is cleanest. Option C is fastest for this phase's SIMPLE complexity scope.

---

## 3. Files to Change

| File                                         | Change                                                                                   |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `src/hooks/scripts/agent-status-sync.ts`     | Read existing bus skill before writing; pass it forward explicitly when bus has no skill |
| `src/skills/__schemas/lu-context.schemas.ts` | (Option A only) Add optional `skill_name` field to `LuContextSchema`                     |
| `src/skills/luca/lu.skill.ts`                | (Option A only) Write `skill_name: "lu"` to context file at initialization               |

Minimum viable change: `agent-status-sync.ts` only (read existing bus skill + fallback from `/tmp/lu-context.json` if Option B/C chosen).

---

## 4. Risk Analysis (Premortem)

### What could go wrong

1. **Double-read race condition**: `agent-status-sync` now reads the bus file before writing. If two Agent() calls fire concurrently (parallel review agents), both could read the same stale bus, then both write — the last write wins, which is fine, but both reads could see `skill: ""` if they both execute before either writes. Result: skill stays empty. Mitigation: the atomic rename pattern in `writeStatusBus` prevents file corruption, but the read-then-write gap is not atomic. Low probability for SIMPLE phases; higher for COMPLEX parallel reviews.

2. **Stale bus triggers skill loss**: The 5-minute stale guard in `writeStatusBus` clears `existing` on old reads. If a long-running phase crosses the 5-minute mark between `skill-status-enter` and the next `agent-status-sync`, the skill will be lost. With the proposed fix (explicit read + pass-through in payload), this is mitigated — but only if `agent-status-sync`'s own explicit read also respects the stale guard. The read should NOT respect staleness for skill preservation purposes.

3. **lu-context.json schema mismatch**: If Option A is chosen and `LuContextSchema` is updated, any existing `/tmp/lu-context.json` from an in-progress run will fail `safeParse` (because `skill_name` is not in the old format). The schema change must use `.optional()` to be backward compatible.

4. **`readStatusBus` import adds coupling**: `agent-status-sync.ts` currently only imports `writeStatusBus`. Adding `readStatusBus` is a one-line import change — low risk, but increases the hook's surface area.

5. **Hook timing**: Both `skill-status-enter` and `agent-status-sync` are `PreToolUse` hooks. Claude Code fires `PreToolUse` hooks in registration order. If `agent-status-sync` fires BEFORE `skill-status-enter` for a `Skill` invocation that contains an `Agent()` call, the skill won't be in the bus yet. However — `skill-status-enter` only fires on `tool_name === "Skill"` and `agent-status-sync` only fires on `tool_name === "Agent"`. These are different tool types, so the ordering issue is: `Skill` fires → `skill-status-enter` writes skill → `Agent` fires → `agent-status-sync` reads bus (skill is present). The ordering is correct for sequential invocations.

### Verdict on Task 2 (fallback-skill-from-context)

The fallback is only needed when `skill-status-enter` failed to fire (bus was cleared, hooks weren't active at Skill invocation time, or skill ran in a prior session). The `/tmp/lu-context.json` file lacks a `skill_name` field, making this task a schema change, not just a read. This is a **gray area** — the task as described assumes a field that doesn't exist yet.

---

## 5. Gray Areas

1. **Lu-context.json does not have a skill field**: Task 2 says "infer from `/tmp/lu-context.json`" but `LuContextSchema` has no `skill_name` field. The fallback requires either a schema addition or a different mechanism (sidecar file, bus self-healing from context).

2. **Is the merge already correct?**: `writeStatusBus` already merges with existing bus data. If the bus is fresh, `skill` is preserved without any change to `agent-status-sync`. The bug may only manifest when the bus is cleared between phases or at session start. Confirm: does the bug reproduce in a fresh session where `lu` was invoked, or only mid-session?

3. **Should `agent-status-sync` read the bus explicitly vs. rely on `writeStatusBus` merge?**: Adding an explicit read in `agent-status-sync` before calling `writeStatusBus` is redundant but makes the intent explicit. The cleaner alternative is to ensure `writeStatusBus`'s merge is always applied even when the bus is stale — perhaps by NOT clearing `existing` for the `skill` field specifically.

4. **Stale guard scope**: Should the 5-minute stale guard in `writeStatusBus` apply to ALL fields or only to non-identity fields? Clearing `skill` because the bus is 5 minutes old seems overly aggressive for a value that changes only at Skill entry.

---

## 6. Recommended Approach

**Task 1 (preserve-skill-field)**: Modify `writeStatusBus` in `status-bus.ts` to NOT clear `skill` when the bus is stale — treat `skill` as a "sticky" field that persists until explicitly overwritten with a non-empty value. This is cleaner than adding a pre-read in `agent-status-sync.ts`.

Alternatively (simpler): in `agent-status-sync.ts`, add an explicit `readStatusBus` call and include `skill` in the payload if it was present in the existing bus. This avoids touching `status-bus.ts` (shared utility).

**Task 2 (fallback-skill-from-context)**: Add `skill_name: z.string().optional()` to `LuContextSchema` and have `lu.skill.ts` write it. Use this as the fallback source in `agent-status-sync.ts` when the bus has no skill.

---

## Output Contract

```
GRAY_AREAS:
- lu-context.json lacks a skill_name field; Task 2 requires a schema addition before the fallback can be implemented
- writeStatusBus already merges with existing data — the bug may only manifest when the bus is stale or cleared; needs reproduction confirmation
- Stale guard (5-minute TTL) aggressively clears skill field; could be made sticky for identity fields only
- Choice of fallback mechanism (schema addition vs. sidecar file vs. bus-level sticky fields) is open

RISKS:
- Parallel Agent() calls (code review wave) could both read skill="" before either writes — race is non-atomic but low probability
- LuContextSchema change must use .optional() to avoid breaking in-progress runs that have an existing /tmp/lu-context.json without skill_name
- Adding readStatusBus import to agent-status-sync increases hook surface area (minor)
- If stale guard fires during a long phase (>5 min), explicit read-then-write in agent-status-sync also reads stale and loses skill — same problem just moved

READY: true
```
