# Research: Phases 130-132 Scope Analysis

**Date:** 2026-03-06
**Researcher:** Claude Agent
**Scope:** Luca framework codebase analysis for features planned in phases 130-132

---

## Phase 130: Advanced Cognitive Features (Cross-Cutting Memory & Personalization)

### Item 1: Cross-Session Procedure Replay (#12)

**What Already Exists:**

- ✅ **Full procedure system already built** in `src/memory/__helpers/`
  - `procedure-parser.ts`: Parses PROCEDURES.md into structured entries
  - `procedure-lifecycle.ts`: Manages active/retired status and lifecycle
  - `procedure-recall.ts`: Recalls procedures by relevance scoring
  - Schema: `ProcedureEntry` in `src/memory/__schemas/memory.schemas.ts` with:
    - ID, title, trigger, ordered steps, success tracking
    - `execution_count`, `success_count`, `success_rate`, `status`
    - `source_agent`, `source_phase`, `added_at`, `last_executed_at`
- **File format:** `.planning/PROCEDURES.md` (parsed, not auto-generated)
- **Storage:** Both markdown (PROCEDURES.md) and JSON (procedures.json via persistence layer)

**What Needs To Be Created:**

1. **Procedure replay executor** — Function to replay stored procedures step-by-step
2. **Success tracking integration** — Hook into harness to log execution outcomes
3. **Procedure retirement logic** — Auto-retire procedures with <20% success rate
4. **Cross-session persistence** — Ensure procedures.json survives across sessions
5. **Procedure recommendation in phase-plan** — Suggest recalled procedures at plan time

**Estimated Complexity:** SIMPLE-to-MODERATE

- Parsing/storage layer 90% complete
- Only need executor + tracking hooks + recommendation logic
- ~200-300 LoC to add

---

### Item 2: Adaptive Complexity Self-Tuning (#13)

**What Already Exists:**

- ✅ **Complexity matrix fully defined** in `src/complexity/__schemas/complexity.schemas.ts`:
  - Five levels: TRIVIAL, SIMPLE, MODERATE, COMPLEX, CRITICAL
  - `COMPLEXITY_LEVELS`, `COMPLEXITY_ORDER`, `COMPLEXITY_TIER` enums
  - `DEFAULT_COMPLEXITY_MATRIX` with gating rules per complexity
- ✅ **Complexity resolution** in `src/complexity/__helpers/complexity-gate.ts`
  - `gate()` function determines which workflow steps activate
  - `should_run()` checks if a step activates at a complexity level
- ✅ **Context tier promotions** based on complexity in `src/context/__helpers/resolve-context-tier.ts`
  - Agents get promoted from default tier to higher tiers at higher complexity
- ✅ **Model routing by complexity** in `src/agents/__helpers/resolve-model.ts`
  - Agents can specify `complexity_overrides` (e.g., CRITICAL→opus)

**What Needs To Be Created:**

1. **Complexity classifier** — Analyze codebase and auto-classify task complexity
2. **Dynamic threshold adjustment** — Learn from past sessions which complexity levels work best
3. **Feedback loop** — Track (complexity_set, actual_outcome) pairs in MEMORY.md
4. **Self-tuning algorithm** — Suggest complexity adjustment if iterations exceed thresholds
5. **Effort calibration learning** — Track and learn effort estimation accuracy per complexity

**Estimated Complexity:** MODERATE-to-COMPLEX

- Matrix exists, but classifier + learning loop are new
- Requires MEMORY.md pattern capture + recall
- ~400-500 LoC to add

---

### Item 3: Portable Cognitive Profiles (#14)

**What Already Exists:**

- ✅ **BRAIN.md system** fully built in `src/memory/__helpers/brain-parser.ts`:
  - Captures project identity, stack, architecture, code conventions
  - Parsed from `BRAIN.md` or loaded from `brain.json`
  - Schema: `Brain` in `src/memory/__schemas/memory.schemas.ts`
- ✅ **MEMORY.md system** fully built:
  - Persistent learnings (patterns, decisions, pitfalls, preferences)
  - Parsed by `memory-parser.ts`, stored in `memory.json`
  - Four categories with confidence levels and recall tracking
- ✅ **JSON persistence layer** in `src/memory/__helpers/json-persistence.ts`:
  - Dual-write to both .md and .json files
  - Automatic serialization/deserialization
  - Default paths: `.planning/brain.json`, `.planning/memory.json`

**What Needs To Be Created:**

1. **Profile export/import utilities** — Serialize BRAIN.md + MEMORY.md to portable format (ZIP or YAML)
2. **Cross-project sharing** — Schema for distributing profiles between projects
3. **Profile merge logic** — Combine profiles from multiple sources without conflicts
4. **Privacy controls** — Filter sensitive entries before export
5. **Versioning** — Track profile versions and migrations

**Estimated Complexity:** SIMPLE-to-MODERATE

- Storage layer 100% complete, just need wrapper utilities
- Export/import/merge are mostly orchestration
- ~250-350 LoC to add

---

### Item 4: Reflective Meta-Cognition (#15)

**What Already Exists:**

- ✅ **Quality scoring system** in `src/memory/__helpers/quality-scorer.ts`:
  - Evaluates memory entries for relevance, freshness, utility
  - Confidence levels (low, medium, high)
  - Recall count tracking
- ✅ **Quality trend analysis** in `src/memory/__helpers/quality-trend.ts`:
  - Analyzes how entries' quality changes over time
  - Identifies patterns of degradation or improvement
- ✅ **Compression engine** in `src/memory/__helpers/auto-compaction.ts`:
  - Recommends summarization, archiving, merging, deduplication
  - Priority scoring for which entries to compress first
- ✅ **Session context capture** partially built:
  - WORKING.md can track immediate findings and hypotheses
  - Schema: `WorkingMemory` with session_info, findings, hypotheses

**What Needs To Be Created:**

1. **Self-evaluation framework** — Agent evaluates own reasoning quality post-execution
2. **Learning extraction engine** — Automatically convert session outcomes into MEMORY.md entries
3. **Epistemic confidence tracking** — Track certainty in different decision categories
4. **Iteration analysis** — Detect when we're spinning vs making progress
5. **Pattern recognition** — Identify repeated mistakes or successful patterns across sessions

**Estimated Complexity:** MODERATE-to-COMPLEX

- Building blocks exist (quality scorer, compression, working memory)
- Need to add self-evaluation logic + pattern mining
- ~500-600 LoC to add

---

### Item 5: Cross-Agent Interop Scanner (#16)

**What Already Exists:**

- ✅ **Agent registry** in `src/agents/__helpers/build-agent-registry.ts`:
  - Maps agent names to factory functions
  - Accessible via `agentRegistry` export
- ✅ **Agent schemas** in `src/agents/__schemas/agent.schemas.ts`:
  - Agent metadata includes tools, cognition, context, model_routing configs
  - No cross-import detection yet
- ✅ **Purpose gating system** in `src/hooks/pi-extensions/luca-purpose-gating.ts`:
  - Checks if agent is eligible to run in given context
  - Returns compatibility status and alternatives
- ✅ **Skill registry** in `src/skills/` with tools array per skill
- ✅ **Rule registry** in `src/rules/` with enabled/disabled states

**What Needs To Be Created:**

1. **Agent dependency mapper** — Build graph of agent→(inputs, outputs, tools used)
2. **Interop compatibility checker** — Validate agent output formats match downstream agent inputs
3. **Tool availability checker** — Verify all required tools are available in execution context
4. **Dead code detector** — Find agents/skills never invoked in any plan
5. **Bottleneck detector** — Identify single-point-of-failure agents in workflow chains

**Estimated Complexity:** MODERATE

- Registry infrastructure exists
- Mainly data structure + graph traversal
- ~300-400 LoC to add

---

### Item 6: Semantic Memory Embeddings (#18)

**What Already Exists:**

- ✅ **Memory entry storage system** fully built (memory.json, MEMORY.md)
- ✅ **Semantic gap detection** in verification:
  - Stall detector tracks `semantic_overlap` (string similarity of error messages)
  - Verification tribunal distinguishes mechanical vs semantic failures
  - Iteration loop runs "semantic gap fix" when semantic issues detected
- ❌ **No vector embeddings or semantic search** currently implemented
  - All recall is keyword/tag based

**What Needs To Be Created:**

1. **Embedding API integration** — Connect to Claude embeddings API
2. **Embedding storage** — Extend memory.json schema to store vectors
3. **Semantic search** — Find entries by semantic similarity, not just tags
4. **Cross-entry linking** — Automatically identify related entries
5. **Anomaly detection** — Identify unusual patterns in memory

**Estimated Complexity:** MODERATE-to-COMPLEX

- New external API required
- Schema extension, storage migration
- Semantic search algorithm
- ~400-500 LoC to add, plus API setup

---

### Item 7: Selective Skill Scaffolding (#23)

**What Already Exists:**

- ✅ **Skill registry** in `src/skills/` with 25+ implemented skills
- ✅ **Complexity gating** applies to skills (some skills only run at COMPLEX+)
- ✅ **Purpose-based gating** in luca-purpose-gating.ts:
  - Skills have `purpose` field (executor, researcher, etc.)
  - Can gate on purpose (e.g., "only run auditors on CRITICAL")
- ❌ **No explicit core vs extended skill separation**
  - Skills have `complexity` gates but not bootstrapping logic

**What Needs To Be Created:**

1. **Core skill set definition** — Define minimal skills required for all projects
2. **Extended skill catalog** — Categorize skills by optional/advanced
3. **Skill scaffold generator** — Create project-specific skill subset at init time
4. **Progressive enablement** — Enable more skills as project matures
5. **Skill discovery** — Recommend missing skills based on project needs

**Estimated Complexity:** SIMPLE

- Infrastructure already exists (registry, gating, schemas)
- Just need categorization + discovery logic
- ~150-250 LoC to add

---

## Phase 131: Platform Expansion & Growth (Hook Portability + Ecosystem)

### Item 1: Hook Portability (#09)

**What Already Exists:**

- ✅ **Dual hook generation** fully implemented:
  - `src/hooks/__helpers/hook-registry.ts` defines canonical hooks once
  - Generates both `.claude/hooks/` (JSON) and `.cursor/hooks.json` formats
  - Supports both platforms with unified API
- ✅ **9 shell scripts** in `src/hooks/scripts/`:
  - Hooks run via execSync on both Claude Code and Cursor
  - Scripts are platform-agnostic (shell + awk)
  - Status messages, error handling, fallback logic
- ✅ **Hook event mapping** between platforms:
  - Claude Code: PostToolUse, PostEdit, SessionEnd, PreToolUse
  - Cursor: camelCase equivalents with dual parsing

**What Needs To Be Created:**

1. **VS Code extension hook support** — Generate hooks for VS Code extension model
2. **JetBrains IDE hooks** — Generate for IntelliJ, WebStorm, etc.
3. **Portable hook environment detection** — Auto-detect platform and use correct format
4. **Hook portability testing** — Validate same hook runs correctly on all platforms
5. **Cross-platform fallback layer** — Allow hooks to work even if platform-specific features unavailable

**Estimated Complexity:** MODERATE

- Dual-platform system proven, add more platforms with similar pattern
- Research required on IDE hook APIs
- ~300-400 LoC to add + API research

---

### Item 2: Plugin Marketplace (#17)

**What Already Exists:**

- ✅ **Plugin output generation** fully working:
  - Compilers in `src/compilers/` generate markdown → `dist/plugin/`
  - Plugin directory contains all agents, skills, rules as structured markdown
- ✅ **Agent registry** accessible via `src/agents/index.ts`
- ✅ **Skill registry** accessible via `src/skills/index.ts`
- ✅ **Rule registry** accessible via `src/rules/index.ts`
- ✅ **Plugin metadata schemas** in various `__schemas/` directories
- ❌ **No centralized plugin marketplace or discovery**
  - Plugin output is local only (dist/plugin/)

**What Needs To Be Created:**

1. **Plugin catalog schema** — Define plugin metadata (name, author, version, dependencies)
2. **Central registry API** — Endpoint to list/search available plugins
3. **Plugin publication workflow** — Steps to publish plugin to marketplace
4. **Version management** — Semantic versioning, compatibility checking
5. **Dependency resolution** — Ensure plugins' dependencies are satisfied
6. **User rating system** — Community feedback on plugin quality

**Estimated Complexity:** MODERATE-to-COMPLEX

- Plugin generation 100% done, need wrapper for marketplace
- Requires backend/registry service (can start local)
- Schema + API + publication workflow
- ~500-700 LoC to add (plus backend setup)

---

### Item 3: Post-Init Tour (#20)

**What Already Exists:**

- ✅ **Project initialization logic** in `src/skills/general/quick.skill.ts`:
  - Auto-initializes minimal `.planning/` if needed
  - Calls `state/bridge.ts ensure-init`
- ✅ **Help system** fully built in `src/skills/general/help.skill.ts`:
  - Documents Luca entry points and common workflows
  - Lists all available skills
- ✅ **Choose skill** in `src/skills/general/choose.skill.ts`:
  - Offers workflow choice at start (Luca, quick, etc.)
  - Mentions `/project-new` command
- ❌ **No interactive post-init tour or onboarding**
  - No guided walkthrough after first setup

**What Needs To Be Created:**

1. **Interactive tour sequence** — Step-by-step walkthrough after init
2. **Learning mode** — Simplified UI/prompts for first-time users
3. **Tour checkpoint system** — Resume tour if interrupted
4. **Customization** — Skip/fast-forward tour steps
5. **Tour feedback** — Collect data on which steps users find most valuable
6. **Progressive disclosure** — Reveal advanced features gradually

**Estimated Complexity:** SIMPLE-to-MODERATE

- Help and choice skills exist, just need sequencing
- Tour is primarily interactive prompting
- ~250-350 LoC to add

---

## Phase 132: Autonomous Routing & Model Management (Complexity + ModelTier + Routing)

### Item 1: Complexity Reads (Throughout Codebase)

**Where Complexity is Currently Read:**

1. **Agents using complexity:**
   - `src/agents/general/lu-router.agent.ts` — Routes tasks to agents based on complexity
   - `src/agents/general/lu-complexity-classifier.agent.ts` (if exists) — Classifies task complexity
   - Model resolver checks complexity for overrides

2. **Skills using complexity:**
   - `src/skills/general/phase-plan.skill.ts` — Complexity affects plan width/depth
   - `src/skills/general/phase-execute.skill.ts` — Reads complexity for harness config
   - `src/skills/general/phase-discuss.skill.ts` — Questions count varies by complexity

3. **Systems using complexity:**
   - `src/context/__helpers/resolve-context-tier.ts` — Context promotion by complexity
   - `src/complexity/__helpers/complexity-gate.ts` — Gate all steps by complexity
   - `src/iteration/__helpers/stall-detector.ts` — Iteration limits by complexity

4. **State system:**
   - Complexity read via state bridge: `bun run packages/luca-framework/src/state/bridge.ts read-complexity`
   - Fallback: grep STATE.md for "Task Complexity:" field

**How Complexity is Set:**

- Explicitly: `--complexity=<level>` flag or user input
- Auto-inferred: lu-router examines task and classifies
- Persisted: Stored in STATE.md `Task Complexity:` field

**Estimated Complexity:** TRIVIAL

- Complexity reads/writes already fully functional
- No changes needed (skip this item)

---

### Item 2: ModelTier in Agent Schemas

**What Already Exists:**

- ✅ **ModelTier enum fully defined** in `src/complexity/__schemas/complexity.schemas.ts`:
  - Values: "fast", "balanced", "capable"
  - Maps to models: haiku, sonnet, opus respectively
  - Maps to computation needs: lightweight, standard, deep-analysis
- ✅ **ModelTier in agent frontmatter** in `src/agents/__schemas/agent.schemas.ts`:
  - Schema field: `model_tier?: ModelTierSchema`
  - Applied in some agents already (check agents for examples)
- ✅ **MODEL_TIER_TO_MODEL mapping** exists:
  ```typescript
  { fast: "haiku", balanced: "sonnet", capable: "opus" }
  ```

**What Needs To Be Audited:**

1. Verify all agents have either `model_tier` or `model_routing` defined
2. Ensure missing model_tier fields added to agents that lack routing config
3. Validate tier assignments match compute needs
4. Document tier assignment guidelines

**Estimated Complexity:** TRIVIAL-to-SIMPLE

- Schema and mapping 100% complete
- Just need to audit and fill in missing fields
- ~100-200 LoC audit/additions

---

### Item 3: Model Routing Configuration

**What Already Exists:**

- ✅ **ModelRoutingConfig schema** in `src/agents/__schemas/agent.schemas.ts`:
  ```typescript
  {
    default_model: ModelIdSchema,        // opus|sonnet|haiku
    complexity_overrides: Record<string, ModelIdSchema>  // e.g., { CRITICAL: "opus" }
  }
  ```
- ✅ **Model resolver** in `src/agents/__helpers/resolve-model.ts`:
  - `resolveModel()` function determines which model to use
  - Checks complexity overrides first, then default_model, then complexity gate
  - Returns `ModelRoutingDecision` with reasoning
- ✅ **Agents with routing config examples:**
  - `lu-verifier.agent.ts`: `model_routing: { default_model: "sonnet", complexity_overrides: { CRITICAL: "opus" } }`
  - `lu-cognition.agent.ts`: Similar setup
  - `lu-router.agent.ts`: Has routing config
  - `lu-executor.agent.ts`: Has routing config

**What Needs To Be Implemented:**

1. **Audit all agents** — Ensure each has appropriate routing or tier definition
2. **Implement model resolver in runtime** — Call `resolveModel()` when spawning agents
3. **Add fallback chain** — complexity_overrides → default_model → model_tier → global gate
4. **Log routing decisions** — Track which model was chosen and why
5. **Runtime override mechanism** — Allow CLI flags to override models (--model=opus)

**Estimated Complexity:** SIMPLE

- Schema and decision logic 100% complete
- Need to wire resolver into agent instantiation
- ~100-150 LoC integration

---

### Item 4: Verification Complexity Coupling (Implicit Discovery)

**What Already Exists (Discovered During Audit):**

- ✅ **Harness configuration** respects complexity:
  - `src/harness/__schemas/harness.schemas.ts` has check limits gated by complexity
  - Verification depth scales: TRIVIAL→quick, SIMPLE→standard, COMPLEX→full
- ✅ **Verification modes** in complexity gate:
  - Maps complexity to verification depth (TRIVIAL→quick, CRITICAL→full+human)
- ✅ **Iteration limits** by complexity:
  - Loop A (mechanical) limits vary by complexity
  - Loop B (semantic) limits vary by complexity
  - Stall detection thresholds adjust by complexity

**What Needs To Be Discovered:**

1. How harness limits are currently set (are they hardcoded or from complexity gate?)
2. Whether verification tier promotions auto-enable additional verifiers
3. If all verification components respect complexity gating uniformly

**Estimated Complexity:** TRIVIAL

- All gating already implemented, just needs documentation

---

## Summary by Phase

### Phase 130: Cognitive Features

| Item                   | Exists | Needs                    | Complexity | Est. LoC |
| ---------------------- | ------ | ------------------------ | ---------- | -------- |
| Procedure replay       | 70%    | Executor+tracking        | SIMPLE     | 200-300  |
| Complexity self-tuning | 80%    | Classifier+learning      | MODERATE   | 400-500  |
| Portable profiles      | 95%    | Export/import utils      | SIMPLE     | 250-350  |
| Meta-cognition         | 50%    | Self-eval+pattern mining | MODERATE   | 500-600  |
| Interop scanner        | 20%    | Mapper+checker           | MODERATE   | 300-400  |
| Semantic embeddings    | 5%     | Embedding API+search     | MODERATE   | 400-500  |
| Skill scaffolding      | 50%    | Categorization+discovery | SIMPLE     | 150-250  |

**Phase 130 Total:** ~2,100-2,900 LoC, MODERATE average complexity

---

### Phase 131: Platform Expansion

| Item               | Exists | Needs                    | Complexity | Est. LoC |
| ------------------ | ------ | ------------------------ | ---------- | -------- |
| Hook portability   | 80%    | More platforms           | MODERATE   | 300-400  |
| Plugin marketplace | 20%    | Registry+API+publication | MODERATE   | 500-700  |
| Post-init tour     | 30%    | Tour sequence+learning   | SIMPLE     | 250-350  |

**Phase 131 Total:** ~1,050-1,450 LoC, SIMPLE-MODERATE average complexity

---

### Phase 132: Routing & Models

| Item             | Exists | Needs               | Complexity | Est. LoC |
| ---------------- | ------ | ------------------- | ---------- | -------- |
| Complexity reads | 100%   | None                | TRIVIAL    | 0        |
| ModelTier audit  | 95%    | Fill missing fields | TRIVIAL    | 100-200  |
| Model routing    | 90%    | Wire into runtime   | SIMPLE     | 100-150  |

**Phase 132 Total:** ~200-350 LoC, TRIVIAL-SIMPLE average complexity

---

## Critical Findings

### ✅ Already Built (Ready to Use)

1. **Procedure system** — Full lifecycle, parsing, recall, success tracking
2. **Complexity matrix** — All 5 levels, gating rules, context promotions, model overrides
3. **Memory system** — BRAIN.md, MEMORY.md, WORKING.md with dual persistence
4. **Model routing** — Schema, decision logic, tier mapping
5. **Hook dual-platform** — Claude Code + Cursor generation proven
6. **Quality scoring** — Memory entry evaluation and compression recommendations

### 🔶 Partially Built (Needs Completion)

1. **Semantic gap detection** — Stall detector has it, needs broader application
2. **Agent registry** — Exists but no cross-agent compatibility checking
3. **Hook portability** — 2 platforms done, need more (VS Code, JetBrains)
4. **Skill complexity gating** — Gate exists, scaffolding categorization missing

### 🔴 Not Started

1. **Adaptive complexity tuning** — Classifier exists, learning loop missing
2. **Profile import/export** — Storage done, serialization missing
3. **Plugin marketplace** — Plugin output exists, marketplace missing
4. **Meta-cognition reflection** — Quality scoring exists, learning extraction missing
5. **Semantic embeddings** — Only string similarity, no vector embeddings

---

## Recommended Phasing

### Phase 130 Recommended Order

1. **Procedure replay** (1-2 days) — Quickest win, builds on complete foundation
2. **Portable profiles** (1-2 days) — High value, mostly orchestration
3. **Skill scaffolding** (0.5-1 day) — Low effort, good for learning
4. **Adaptive complexity** (2-3 days) — Higher complexity but high value
5. **Meta-cognition** (2-3 days) — Depends on complexity learning
6. **Interop scanner** (1-2 days) — Depends on agent status
7. **Semantic embeddings** (2-3 days) — Lowest priority, requires external API

### Phase 131 Recommended Order

1. **Post-init tour** (1-2 days) — Quick, visible impact
2. **Hook portability** (1-2 days) — Build on proven pattern
3. **Plugin marketplace** (3-4 days) — Highest effort, enable ecosystem

### Phase 132 Recommended Order

1. **Model routing** (1 day) — Wire existing resolver into runtime
2. **ModelTier audit** (0.5-1 day) — Fill in gaps
3. **Complexity reads** (0 days) — Already complete
