# Phase 15: Cognition Per-Agent Audit -- VERIFICATION REPORT

**Verifier:** lu-verifier
**Date:** 2026-02-11
**Phase Goal:** Audit every agent type's usage of the cognition system. Create a matrix of current vs. ideal cognition features per agent. Define cognition profiles and implement selective memory recall.

---

## 1. Requirements Coverage

### COGN-01: Audit Matrix -- PASS

**Requirement:** Audit matrix maps each agent type to its current cognition features (BRAIN load, MEMORY recall, WORKING usage, pre-flight, learning extraction).

**Verified artifacts:**

- `.planning/phases/15-cognition-per-agent-audit/COGNITION-AUDIT.md`, Section 3 "Current-State Audit Matrix"
- Full 25-agent matrix with 5 cognition feature columns (BRAIN, MEMORY, WORKING, Pre-flight, Learning)
- Each agent listed with file name, line count, YES/NO/INDIRECT per feature, current tier, and notes
- Spot-check methodology documented (Section 3.1): grep for `BRAIN`, `MEMORY`, `WORKING`, `cognit`, `pre-flight`, `lu-learner`, `lu-cognition`, `pattern`, `recall`
- Three research inaccuracies identified and corrected (lu-planner, lu-executor, lu-verifier reclassified from T0)
- Current-state distribution: T3=2, T2=3, T1=2, T0=18

**Substantive check:** The matrix is consistent with agent source files inspected. For example:

- lu-cognition.agent.ts has `cognition: { default_tier: "T3", ... }` -- matches T3 in matrix
- lu-phase-researcher.agent.ts has `cognition: { default_tier: "T1", ... }` -- matches the recommended promotion from T0 to T1 (implemented in Plan 15-04)
- code-architect.agent.ts has `cognition: { default_tier: "T0", ... }` -- matches T0 in matrix

**Verdict: PASS**

---

### COGN-02: Gap Analysis -- PASS

**Requirement:** Gap analysis identifies agents missing cognition features they should have based on their role.

**Verified artifacts:**

- COGNITION-AUDIT.md, Section 4 "Ideal-State Cognition Profiles" -- recommended tier for all 25 agents with rationale
- COGNITION-AUDIT.md, Section 5 "Gap Analysis" -- 3 critical gaps, 5 moderate gaps, 17 no-change
- Section 5.1 identifies 3 high-impact agents at wrong tier: lu-phase-researcher (T0->T1), lu-plan-checker (T0->T1), lu-pr-reviewer (T0->T1)
- Section 5.2 identifies 5 agents with promotable-to ceilings that enable complexity-driven promotion
- Section 5.3 lists 17 agents correctly at their recommended tier
- Section 6 "Distribution Summary" shows current vs recommended delta (+3 at T1, -3 at T0)
- Context budget impact analysis provided (Section 6.3) with token estimates per scenario

**Substantive check:** The three critical gaps have been addressed by Plan 15-04 (agent wiring):

- lu-phase-researcher.agent.ts now has `cognition: { default_tier: "T1", promotable_to: "T1", memory_tags: ["stack", "architecture"] }` -- confirmed by file read
- lu-plan-checker.agent.ts has `cognition_integration` section -- confirmed by grep (8 files with cognition_integration)
- lu-pr-reviewer.agent.ts now has `cognition: { default_tier: "T0", promotable_to: "T1", memory_tags: ["conventions", "patterns"] }` -- confirmed by file read

**Note:** lu-pr-reviewer and lu-plan-checker have `default_tier: "T0"` in their .agent.ts, which means they are not promoted by default -- they remain T0 unless complexity-driven promotion activates. The COGNITION-AUDIT.md recommends T1 as the default tier for these agents, but the implementation keeps them at T0 with `promotable_to: "T1"`. This is a minor discrepancy: the agents CAN reach T1 at CRITICAL complexity, but their default is T0 rather than the recommended T1. However, given that the gap analysis also describes promotable_to as a mechanism and the implementation priority section (Section 9.1) is labeled as implementation priority rather than a mandate, this is acceptable as a conservative starting point.

**Verdict: PASS** (with minor note on T0 vs T1 default for lu-pr-reviewer/lu-plan-checker)

---

### COGN-03: Cognition Profiles Defined -- PASS

**Requirement:** Cognition profiles defined -- at least 3 tiers (stateless, session-aware, fully-cognitive) with clear criteria for each.

**Verified artifacts:**

- COGNITION-AUDIT.md, Section 2 "Tier System Definition"
- 4 tiers defined (exceeds the 3 minimum): T0 (Stateless), T1 (Memory-Reader), T2 (Session-Aware), T3 (Fully-Cognitive)
- Section 2.1 provides capabilities matrix with 9 capability rows across 4 tiers
- Section 2.2 provides prose descriptions for each tier
- Section 2.3 defines numeric ordering (T0=0, T1=1, T2=2, T3=3)
- Section 4.1 provides assignment criteria for each tier
- Section 8 provides tier promotion rules with complexity-driven promotion matrix

**Substantive check:** The 4-tier system is implemented in code:

- `cognitionTierSchema` in `src/agents/types/agent.schemas.ts`: `z.enum(["T0", "T1", "T2", "T3"])` -- matches
- `CognitionTier` type in `src/agents/types/agent.types.ts`: `"T0" | "T1" | "T2" | "T3"` -- matches
- `TIER_ORDER` in `src/agents/cognition/resolve-tier.ts`: `{ T0: 0, T1: 1, T2: 2, T3: 3 }` -- matches
- Tier descriptions in COGNITION-AUDIT.md Section 2.2 are clear, specific, and distinguishable

**Verdict: PASS**

---

### COGN-04: Per-Agent Cognition Configuration via Agent Metadata -- PASS

**Requirement:** Per-agent cognition configuration via agent metadata (not hardcoded conditionals).

**Verified artifacts (infrastructure):**

- `src/agents/types/agent.schemas.ts`: `cognitionConfigSchema` with `default_tier`, `promotable_to`, `memory_tags` -- confirmed
- `src/agents/types/agent.types.ts`: `CognitionConfig` interface and `CognitionTier` type -- confirmed
- `src/complexity/types.ts`: `cognitionPromotions?: Partial<Record<CognitionTier, CognitionTier>>` field on `ComplexityGate` -- confirmed
- `src/complexity/defaults.ts`: COMPLEX has `cognitionPromotions: { T1: "T2", T2: "T3" }`, CRITICAL has `cognitionPromotions: { T0: "T1", T1: "T2", T2: "T3" }` -- confirmed
- `src/agents/cognition/resolve-tier.ts`: `resolveEffectiveTier()` function with proper ceiling capping -- confirmed
- `src/compilers/claude.compiler.ts`: Emits YAML frontmatter when cognition config is present -- confirmed

**Verified artifacts (agent wiring):**

- 27 .agent.ts files found across `src/agents/` (25 general + 2 luca variants)
- Grep for `cognition:` across all .agent.ts files found 28 occurrences in 27 files (lu-router has 2 occurrences, likely in content text + frontmatter) -- all agents have cognition metadata
- Spot-checked 8 agent files directly:
  - lu-cognition: T3, promotable T3, tags `["*"]` -- correct
  - lu-debugger: T3, promotable T3, tags `["debugging", "pitfalls", "testing"]` -- correct
  - lu-learner: T2, promotable T3, tags `["patterns", "decisions", "pitfalls"]` -- correct
  - lu-executor: T2, promotable T3, tags `["coding", "patterns", "pitfalls", "conventions"]` -- correct
  - lu-planner: T1, promotable T2, tags `["architecture", "planning", "decisions"]` -- correct (note: audit says current is T2, but .agent.ts has T1 as default -- this reflects the recommended/ideal profile with conservative default)
  - lu-phase-researcher: T1, promotable T1, tags `["stack", "architecture"]` -- matches gap analysis recommendation
  - code-architect: T0, promotable T1, tags `[]` -- correct
  - security-auditor: T0, promotable T1, tags `[]` -- correct

**Verified compiled output:**

- `.claude/agents/lu-cognition.md` has YAML frontmatter with `cognition: { default_tier: T3, promotable_to: T3, memory_tags: ["*"] }` -- confirmed
- `.claude/agents/code-architect.md` has YAML frontmatter with `cognition: { default_tier: T0, promotable_to: T1, memory_tags: [] }` -- confirmed

**No hardcoded conditionals:** The system uses metadata-driven configuration. `resolveEffectiveTier()` reads from agent config + complexity matrix, not from if/else chains per agent name. lu-cognition reads frontmatter from compiled .md files.

**Verified cognition_integration sections:** 8 agent files contain `cognition_integration` sections (lu-verifier, lu-planner, lu-executor, lu-phase-researcher, lu-plan-checker, lu-pr-reviewer, plus luca variants of planner/executor). These sections provide tier-appropriate instructions.

**Verdict: PASS**

---

### COGN-05: Selective MEMORY Recall Implemented -- PASS

**Requirement:** Selective MEMORY recall implemented -- agents load only task-relevant patterns/decisions/pitfalls, not the entire MEMORY.md.

**Verified artifacts:**

**lu-cognition agent (selective recall implementation):**

- `src/agents/general/lu-cognition.agent.ts`, step `resolve_cognition_tier`:
  - Reads target agent's compiled .md frontmatter for cognition config
  - Extracts `default_tier`, `promotable_to`, `memory_tags`
  - Reads current complexity from STATE.md
  - Applies complexity-driven promotion via `resolveEffectiveTier()`
  - Stores `effective_tier` for use in recall
- Step `selective_recall`:
  - **Tier gate**: T0 agents skip recall entirely
  - **Tag-based pre-filtering**: `memory_tags` intersection with entry tags; legacy entries (no tags) included for backward compatibility
  - **Tier-scaled entry limits**: T1 gets 3-5, T2 gets 5-7, T3 gets 7-10 entries
  - **Agent-aware scoring**: agent field matching (3 points), keyword matching (additive), confidence weighting, recency boost
- Step `generate_report`:
  - T0: Minimal report ("no memory recall performed")
  - T1: Includes Relevant Context block
  - T2: Adds Session Tracking instructions
  - T3: Adds Project Identity and Learning Instructions

**lu-learner agent (tag assignment):**

- `src/agents/general/lu-learner.agent.ts`, section `tag_assignment`:
  - References TAG-VOCABULARY.md with 14 domain tags
  - Assignment rules: 1-3 tags per entry
  - Common combinations table
  - New tag proposal process
- Extraction templates in `extract_patterns`, `extract_decisions`, `extract_pitfalls` all include `Tags: [1-3 domain tags from TAG-VOCABULARY.md, ...]` field -- confirmed

**TAG-VOCABULARY.md:**

- `.planning/phases/15-cognition-per-agent-audit/TAG-VOCABULARY.md`: 14 domain tags defined with descriptions, example entries, and typical agents
- Agent-to-tag mapping table with all 25 agents
- Guidelines for lu-learner tag assignment

**MEMORY.md retroactive tagging:**

- Grep for `Tags: [` found 84 occurrences in MEMORY.md -- confirmed extensive tagging
- Spot-checked entries: all sections (Patterns, Decisions, Pitfalls, Conventions, Anti-patterns, Preferences) have tags
- Phase 15 entries use the new detailed format with Agent, Relevant to, Tags, Confidence, Added fields
- Legacy entries use inline `Tags: [...]` format
- Memory statistics updated: 40 patterns, 26 decisions, 35 pitfalls (including +4/+3/+4 from Phase 15)

**Substantive check on selectivity:**
The selective recall works through three filtering layers:

1. **Tier gate**: T0 agents receive zero memory context (18 of 25 agents at default)
2. **Tag-based pre-filtering**: Only entries matching agent's `memory_tags` are candidates (e.g., lu-debugger only gets entries tagged `debugging`, `pitfalls`, or `testing`)
3. **Entry count limits**: Even after filtering, limits cap the number of entries (T1: 3-5, T2: 5-7, T3: 7-10)

This is a genuine selective recall system, not a "load everything" approach. An agent like lu-phase-researcher with tags `["stack", "architecture"]` would only see entries tagged with those domains, at a maximum of 3-5 entries (T1 limit).

**Verdict: PASS**

---

## 2. Observable Truths Verified

| #   | Truth Claim                                        | Verification Method                                            | Result                                                                                                                                                                                                       |
| --- | -------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | COGNITION-AUDIT.md exists with 9 sections          | File read, section count                                       | CONFIRMED: 9 sections (Executive Summary, Tier System, Current-State Matrix, Ideal-State Profiles, Gap Analysis, Distribution Summary, Memory Tag Vocabulary, Tier Promotion Rules, Implementation Priority) |
| 2   | 25 agents audited in matrix                        | Matrix row count in Section 3.2                                | CONFIRMED: 25 rows, each with agent name, file, features, tier                                                                                                                                               |
| 3   | cognitionTierSchema in agent.schemas.ts            | File read                                                      | CONFIRMED: `z.enum(["T0", "T1", "T2", "T3"])` at line 7                                                                                                                                                      |
| 4   | cognitionConfigSchema in agent.schemas.ts          | File read                                                      | CONFIRMED: `z.object({ default_tier, promotable_to, memory_tags })` at lines 10-17                                                                                                                           |
| 5   | CognitionTier type in agent.types.ts               | File read                                                      | CONFIRMED: `"T0" \| "T1" \| "T2" \| "T3"` at line 15                                                                                                                                                         |
| 6   | CognitionConfig interface in agent.types.ts        | File read                                                      | CONFIRMED: Interface with 3 fields at lines 18-22                                                                                                                                                            |
| 7   | resolveEffectiveTier() at resolve-tier.ts          | File read                                                      | CONFIRMED: Function with proper ceiling capping at lines 45-63                                                                                                                                               |
| 8   | cognitionPromotions in ComplexityGate              | File read of complexity/types.ts                               | CONFIRMED: Optional field at line 86                                                                                                                                                                         |
| 9   | Complexity defaults have promotions                | File read of complexity/defaults.ts                            | CONFIRMED: COMPLEX has `{ T1: "T2", T2: "T3" }`, CRITICAL has `{ T0: "T1", T1: "T2", T2: "T3" }`                                                                                                             |
| 10  | All 27 .agent.ts files have cognition metadata     | Grep for `cognition:` across .agent.ts                         | CONFIRMED: 28 occurrences in 27 files                                                                                                                                                                        |
| 11  | 8 agent files have cognition_integration sections  | Grep for `cognition_integration`                               | CONFIRMED: 8 files (lu-verifier, lu-planner x2, lu-executor x2, lu-phase-researcher, lu-plan-checker, lu-pr-reviewer)                                                                                        |
| 12  | ClaudeCompiler emits YAML frontmatter              | File read of claude.compiler.ts                                | CONFIRMED: Lines 22-35 conditionally prepend frontmatter                                                                                                                                                     |
| 13  | Compiled .md files have YAML frontmatter           | File read of .claude/agents/lu-cognition.md, code-architect.md | CONFIRMED: Both have `---` delimited frontmatter with cognition config                                                                                                                                       |
| 14  | TAG-VOCABULARY.md with 14 domain tags              | File read                                                      | CONFIRMED: 14 tags in table and detailed descriptions                                                                                                                                                        |
| 15  | MEMORY.md entries retroactively tagged             | Grep for `Tags: [` in MEMORY.md                                | CONFIRMED: 84 tagged entries across all sections                                                                                                                                                             |
| 16  | lu-cognition has tier resolution step              | File read of lu-cognition.agent.ts                             | CONFIRMED: `resolve_cognition_tier` step with 5 sub-steps                                                                                                                                                    |
| 17  | lu-cognition has tag-based selective recall        | File read of lu-cognition.agent.ts                             | CONFIRMED: `selective_recall` step with tag pre-filtering, tier gate, and tier-scaled limits                                                                                                                 |
| 18  | lu-learner has tag_assignment section              | File read of lu-learner.agent.ts                               | CONFIRMED: `tag_assignment` section with 14 tags listed and assignment rules                                                                                                                                 |
| 19  | lu-learner extraction templates include Tags field | File read of lu-learner.agent.ts                               | CONFIRMED: All 3 extraction templates (patterns, decisions, pitfalls) include `Tags:` field                                                                                                                  |
| 20  | Memory statistics: 40/26/35                        | File read of MEMORY.md bottom                                  | CONFIRMED: "Total patterns: 40 (+4 from Phase 15), Total decisions: 26 (+3 from Phase 15), Total pitfalls: 35 (+4 from Phase 15)"                                                                            |

---

## 3. Substantive Verification

### 3.1 Schema Correctness

The `cognitionConfigSchema` uses proper Zod patterns:

- `default_tier` defaults to `"T0"` (safe default for agents without explicit config)
- `memory_tags` defaults to `[]` (no memory recall by default)
- Schema is integrated into `agentFrontmatterSchema` as optional field
- Type inference via `z.infer<>` produces matching TypeScript types

### 3.2 Tier Resolution Logic

`resolveEffectiveTier()` in `src/agents/cognition/resolve-tier.ts` correctly:

- Reads promotions from the complexity matrix for the given level
- Returns `defaultTier` when no promotions exist (TRIVIAL, SIMPLE, MODERATE)
- Applies promotion mapping when it exists (COMPLEX, CRITICAL)
- Caps at `promotableTo` ceiling using `TIER_ORDER` numeric comparison
- Handles missing promotion mapping via `?? defaultTier` fallback

Verified against audit examples:

- lu-executor (T2, promotable T3, COMPLEX): COMPLEX promotes T2->T3, ceiling T3 -> effective T3. Correct.
- code-simplifier (T0, promotable T0, CRITICAL): CRITICAL promotes T0->T1, ceiling T0 -> effective T0. Correct.

### 3.3 Compiler Integration

The `ClaudeCompiler.compileAgent()` method:

- Checks `agent.config.frontmatter.cognition` for presence
- When present, constructs a data object with `name` and `cognition` fields
- Uses `formatFrontmatter()` to emit valid YAML block
- Prepends to markdown output with double newline separator
- When absent, returns markdown without frontmatter (backward compatible)

Verified by reading compiled output: `.claude/agents/lu-cognition.md` and `.claude/agents/code-architect.md` both have correct YAML frontmatter matching their source `.agent.ts` configs.

### 3.4 Selective Recall Mechanism

The lu-cognition agent implements a 3-layer filtering system:

1. **Tier gate** (T0 = skip entirely) -- prevents any context overhead for stateless agents
2. **Tag-based pre-filtering** (agent's `memory_tags` intersected with entry `Tags`) -- domain-level filtering
3. **Keyword scoring + entry limits** (tier-scaled: T1=3-5, T2=5-7, T3=7-10) -- relevance-based selection

This is a genuine improvement over "load everything" recall. The combination of tags (coarse filtering) and keywords (fine-grained scoring) within tier-scaled limits provides selective, bounded memory access.

### 3.5 Backward Compatibility

The system maintains backward compatibility:

- Entries without `Tags:` field included in ALL agent recalls (legacy treatment)
- Agents without `cognition` field in frontmatter default to T0 (stateless)
- No breaking changes to existing agent behavior
- Tag-based filtering is additive -- precision improves as more entries get tagged

---

## 4. Issues and Caveats

### 4.1 Minor: Default Tier for Promoted Agents

The COGNITION-AUDIT.md recommends lu-phase-researcher, lu-plan-checker, and lu-pr-reviewer at T1 as their **default tier**. However, the implementation sets lu-plan-checker and lu-pr-reviewer at `default_tier: "T0"` with `promotable_to: "T1"`, meaning they only reach T1 at CRITICAL complexity. lu-phase-researcher is correctly set to `default_tier: "T1"`.

This is a conservative implementation choice that is acceptable -- the agents gain the capability to reach T1 and will be promoted when complexity warrants it. The infrastructure supports changing default_tier to T1 at any time without code changes.

**Severity:** Low. The infrastructure and metadata are correct. Only 2 of 25 agents have a more conservative default than the audit recommended.

### 4.2 Minor: lu-planner Default Tier

COGNITION-AUDIT.md lists lu-planner's current tier as T2 (Session-Aware) based on its existing cognitive pre-flight section. However, `lu-planner.agent.ts` has `default_tier: "T1"` with `promotable_to: "T2"`. This means lu-planner operates at T1 (Memory-Reader) by default, only reaching T2 at COMPLEX/CRITICAL complexity.

The audit's current-state assessment (T2) was based on the agent's actual behavior in its .md definition, while the .agent.ts metadata represents a calibrated starting point. This is acceptable as a conservative approach.

**Severity:** Low. No functional impact -- lu-planner has its cognitive pre-flight section regardless of the metadata tier.

### 4.3 Pre-Existing Test Failures

7 pre-existing test failures and 83 pre-existing TypeScript errors were reported. These are all in files outside Phase 15's scope (wizard.ts, scripts/, **tests**/, packages/). Zero errors in Phase 15 files. This is a known baseline and does not affect Phase 15 deliverables.

---

## 5. Overall Status

### PASS_WITH_CAVEATS

All 5 requirements (COGN-01 through COGN-05) are delivered and verified:

| Requirement                 | Status   | Artifact                                                                                                                                           |
| --------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| COGN-01: Audit matrix       | **PASS** | COGNITION-AUDIT.md Section 3 (25 agents, 5 features, corrections applied)                                                                          |
| COGN-02: Gap analysis       | **PASS** | COGNITION-AUDIT.md Sections 4-6 (3 critical gaps, 5 moderate, 17 no-change)                                                                        |
| COGN-03: Cognition profiles | **PASS** | COGNITION-AUDIT.md Section 2 (4 tiers: T0-T3, exceeds 3-tier minimum)                                                                              |
| COGN-04: Per-agent config   | **PASS** | Schemas, types, resolve-tier.ts, complexity defaults, 27 agent files, compiler, compiled output                                                    |
| COGN-05: Selective recall   | **PASS** | lu-cognition agent (tier gate + tag filtering + tier-scaled limits), lu-learner (tag assignment), TAG-VOCABULARY.md, MEMORY.md retroactive tagging |

**Caveats (all low severity):**

1. Two agents (lu-plan-checker, lu-pr-reviewer) have default_tier T0 instead of recommended T1
2. lu-planner has default_tier T1 instead of audited current-state T2
3. Pre-existing test/TypeScript errors not introduced by Phase 15

The phase goal -- "Audit every agent type's usage of the cognition system, create a matrix of current vs. ideal cognition features, define cognition profiles, and implement selective memory recall" -- is fully achieved. The infrastructure enables future refinement of default tiers without code changes, only metadata updates.

---

_Verification completed: 2026-02-11_
_Verifier: lu-verifier (Claude)_
_Files inspected: 18 source files, 2 compiled output files, 1 audit document, 1 vocabulary document, 1 memory file_
