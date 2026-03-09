# Phase 01: Recall Scoring Optimization - Research

**Researched:** 2026-03-08
**Domain:** lu-cognition recall scoring (agent prompt text + config)
**Confidence:** HIGH

## Summary

This phase modifies two areas: (1) the `selective_recall` step text in `lu-cognition.agent.ts` to add complexity-gated entry limits and milestone decay scoring, and (2) `.planning/config.json` to add a `recallDepth` field to the complexity matrix.

All changes are to agent prompt text (string literals inside TypeScript) and JSON config. No TypeScript logic, schemas, or runtime code changes are needed.

**Primary recommendation:** Edit the `selective_recall` step content string in `lu-cognition.agent.ts` at two specific locations, and add `recallDepth` to each complexity level in `config.json`.

## Modification Points

### 1. Tier-Scaled Entry Limits (complexity gating)

**File:** `src/agents/general/lu-cognition.agent.ts`
**Location:** Lines 331-339 (inside the `selective_recall` step content string)

**Current text (verbatim):**

```
**Tier-Scaled Entry Limits (NEW — replaces fixed 5-7 limit):**

\`\`\`
Sort scored entries descending, then select top entries by effective_tier:

IF effective_tier == T1: select top 3-5 entries (lightweight recall)
IF effective_tier == T2: select top 5-7 entries (standard recall)
IF effective_tier == T3: select top 7-10 entries (comprehensive recall)
\`\`\`
```

**What to change:** Add a complexity check BEFORE the tier-scaled limits. When `recallDepth` from config is `0`, skip recall (lite mode already handles TRIVIAL/SIMPLE). When `recallDepth` is a number (e.g., 3 for MODERATE), cap entries at that number regardless of tier. When `recallDepth` is `null` (COMPLEX/CRITICAL), use existing tier-scaled defaults.

**Proposed new pseudocode to insert before the tier limits:**

```
1. Read recallDepth from complexity matrix for current complexity level
2. IF recallDepth == 0: skip recall (lite mode)
3. IF recallDepth is a number: cap entries at recallDepth regardless of tier
4. IF recallDepth is null: use tier-scaled defaults below
```

### 2. Scoring Pseudocode (milestone decay)

**File:** `src/agents/general/lu-cognition.agent.ts`
**Location:** Lines 289-323 (the scoring pseudocode block inside `selective_recall`)

**Current scoring pseudocode (verbatim):**

```
score = 0

# Agent matching (highest priority)
if entry.agent == upcoming_agent:
    agent_score = 3  # Direct match
elif upcoming_agent in entry.relevant_to:
    agent_score = 2  # Listed in relevance
elif entry.agent == "general" OR entry.agent is missing:
    agent_score = 1  # Cross-cutting or legacy entry
else:
    agent_score = 0  # Different agent, no relevance

score += agent_score

# Keyword matching (additive)
keyword_matches = count_matches(entry.content, task_keywords)
score += keyword_matches

# Confidence weighting
if entry.confidence == "High":
    score += 1
elif entry.confidence == "Medium":
    score += 0.5

# Recency boost (optional)
if entry.added within 30 days:
    score += 0.5
```

**What to add:** A new section after "Recency boost" for milestone proximity scoring:

```
# Milestone proximity scoring (NEW)
current_milestone = resolve from state machine bridge or STATE.md
if entry has milestone tag:
    if entry.milestone == current_milestone:
        score *= 1.5  # Current milestone boost
    elif entry.milestone == current_milestone - 1:
        score *= 1.0  # Previous milestone, neutral
    else:
        score *= 0.25  # Old milestone, aggressive decay
else:
    score *= 0.5  # No milestone tag (legacy), deprioritize
```

### 3. Lite Mode Skip Behavior

**File:** `src/agents/general/lu-cognition.agent.ts`
**Location:** Lines 94-147 (the `check_complexity_mode` step)

**Current behavior:** TRIVIAL/SIMPLE already skip recall via lite mode (lines 98-99, 104-146). This is confirmed — no changes needed here. The `recallDepth: 0` for TRIVIAL/SIMPLE in config.json aligns with this existing behavior.

### 4. Config.json Addition

**File:** `.planning/config.json`
**Location:** Lines 100-138 (the `complexity.matrix` section)

**Current structure per level:**

```json
"TRIVIAL": {
  "cognitivePreflight": "lite",
  "planVerificationIterations": 0,
  "harnessFixIterations": 1,
  "verifyFixIterations": 0,
  "verificationMode": "quick"
}
```

**Add `recallDepth` to each level:**

```json
"TRIVIAL": { ..., "recallDepth": 0 },
"SIMPLE":  { ..., "recallDepth": 0 },
"MODERATE": { ..., "recallDepth": 3 },
"COMPLEX":  { ..., "recallDepth": null },
"CRITICAL": { ..., "recallDepth": null }
```

Where:

- `0` = skip recall (lite mode already handles this)
- `3` = cap at 3 entries regardless of tier
- `null` = use tier-scaled defaults (T1: 3-5, T2: 5-7, T3: 7-10)

### 5. Complexity Schema (optional, not required)

**File:** `src/complexity/__schemas/complexity.schemas.ts`
**Location:** Lines 116-151 (`ComplexityGateSchema`)

The CONTEXT.md says "No schema changes needed (this is agent prompt text, not TypeScript types)." However, if the planner wants the `recallDepth` field to be validated by Zod, it would be added here:

```typescript
recallDepth: z.number().int().nonnegative().nullable().optional(),
```

This is optional — `config.json` can have the field without a schema change since the config is read as plain JSON by the agent prompt text. The complexity schema only validates the programmatic `DEFAULT_COMPLEXITY_MATRIX` in `defaults.ts`, not the JSON config directly.

**Note:** If `recallDepth` is added to the schema, it must also be added to `src/complexity/__helpers/defaults.ts` (lines 97-143) for each level in `DEFAULT_COMPLEXITY_MATRIX`. The CONTEXT.md explicitly says NOT to modify schemas, so this is deferred.

## Risks and Gotchas

### 1. Config.json vs defaults.ts Divergence

The `config.json` complexity matrix has different values than `DEFAULT_COMPLEXITY_MATRIX` in `defaults.ts`:

- Config.json TRIVIAL has `planVerificationIterations: 0`, defaults.ts has `1`
- Config.json SIMPLE has `planVerificationIterations: 0`, defaults.ts has `1`
- Several other minor differences

This means `config.json` overrides `defaults.ts` at runtime. Adding `recallDepth` only to `config.json` is correct — it follows the existing override pattern.

### 2. Agent Prompt Text Is a String Literal

All changes to `lu-cognition.agent.ts` are inside a JavaScript template literal string (the `content` property of the `selective_recall` section). The content starts at line 236 and ends around line 350. Special characters in template literals need escaping (backticks are escaped as `\\\`\\\`\\\``).

### 3. Milestone Resolution

The milestone proximity scoring references resolving `current_milestone` from state machine bridge or STATE.md. This is already established in the `resolve_cognition_tier` step (lines 190-198) which reads complexity from the bridge. Milestone is currently referenced at lines 261-265 in the milestone-scoped recall section. The scoring addition should reference the same milestone value.

### 4. No build:all Required

Since this modifies source files (`src/agents/`), the generated files in `.claude/agents/lu-cognition.md` will be out of date until `bun run build:all` is run. Per MEMORY.md, `build:all` crashes Claude Code sessions — the user must run it manually after this phase completes.

### 5. Success Criteria Reference

The `success_criteria` section at line 751 already mentions tier-scaled entry counts:

```
- [ ] Entry count scaled by effective tier (T1: 3-5, T2: 5-7, T3: 7-10)
```

This line should be updated to reflect the new complexity-gated behavior.

## Sources

### Primary (HIGH confidence)

- `src/agents/general/lu-cognition.agent.ts` — Direct file read, all line references verified
- `.planning/config.json` — Direct file read, structure confirmed
- `src/complexity/__schemas/complexity.schemas.ts` — Direct file read, schema confirmed
- `src/complexity/__helpers/defaults.ts` — Direct file read, defaults confirmed
- `.planning/phases/01-recall-scoring-optimization/01-CONTEXT.md` — User decisions

## Metadata

**Confidence breakdown:**

- Modification points: HIGH — all verified via direct file reads
- Scoring pseudocode: HIGH — exact text confirmed in source
- Config structure: HIGH — exact JSON structure confirmed
- Risks: HIGH — divergence between config.json and defaults.ts confirmed

**Research date:** 2026-03-08
**Valid until:** 2026-04-08 (stable — agent prompt text changes infrequently)
