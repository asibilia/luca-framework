# phase-discuss

Gather phase context through adaptive questioning before creating execution plans.

## main

<main>
# <%= branding.frameworkName %> Discuss Phase

Extract implementation decisions that downstream agents need — researcher and planner will use CONTEXT.md to know what to investigate and what choices are locked.

**Arguments:** `<phase> [--auto] [--run-premortem | --skip-premortem]`

## Vault Resolution

Read `.planning/config.json` and extract `muninn.vault` as REPO_VAULT. Set DEFAULT_VAULT = "default".

\`\`\`bash
REPO_VAULT=$(cat .planning/config.json 2>/dev/null | grep -o '"vault"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | grep -o '"[^"]*"$' | tr -d '"')
if [ -z "$REPO_VAULT" ]; then
  REPO_VAULT=${LUCA_MUNINN_VAULT:-default}
fi
DEFAULT_VAULT="default"
\`\`\`

Use REPO_VAULT for project-scoped operations (session, metric, brain:project) and DEFAULT_VAULT for cross-cutting operations (pattern, pitfall, preference, brain:user).

## How It Works

### Interactive Mode (default)

1. Analyze the phase to identify gray areas (UI, UX, behavior, etc.)
2. Present gray areas — user selects which to discuss
3. Deep-dive each selected area until satisfied
4. Create CONTEXT.md with decisions that guide research and planning

### Auto Mode (`--auto` flag)

1. Analyze the phase to identify gray areas (same as interactive)
2. Auto-select ALL gray areas (no user prompt)
3. Load project tech stack from MuninnDB
4. Spawn `<%= branding.commandPrefix %>-discuss-researcher` agent per gray area question (web research)
5. Present research summary with citations before writing
6. Offer user override: accept all / override some / switch to interactive
7. Create CONTEXT.md with researched decisions (annotated with source provenance)

Auto mode is useful when running via `<%= branding.commandSlash %>` in autonomous mode or when the user wants AI-researched decisions instead of manual discussion.

**Output:** `{phase}-CONTEXT.md` — decisions clear enough that downstream agents can act without asking the user again

## Execution Context

Read these reference files before executing:

- `.claude/<%= branding.nameLowercase %>/workflows/discuss-phase.md`
- `.claude/<%= branding.nameLowercase %>/templates/context.md`

## Process


### Complexity-Aware Discussion

Read complexity from bridge:

```bash
COMPLEXITY=$(luca-bridge read-complexity 2>/dev/null | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.complexity)" 2>/dev/null || echo "MODERATE")
```

**Always runs.** Discussion depth and model tier scale with complexity:

| Complexity | Discussion Depth | Model Tier (<%= branding.commandPrefix %>-discuss-researcher) |
|------------|-----------------|-------------------------------------|
| TRIVIAL | Light (2 questions per area) | fast |
| SIMPLE | Light (2 questions per area) | balanced |
| MODERATE | Standard (4 questions per area) | balanced |
| COMPLEX | Extended (4+ questions per area) | capable |
| CRITICAL | Thorough (6+ questions per area) | capable |

The <%= branding.commandPrefix %>-discuss-researcher model tier is resolved via `resolveModelForAgent("<%= branding.commandPrefix %>-discuss-researcher", complexity)` from the centralized routing table.

1. **Validate phase number** (error if missing or not in roadmap)
2. **Check if CONTEXT.md exists** (offer update/view/skip if yes)
3. **Detect mode** — If `--auto` flag is present, use auto mode (steps 4a-8a). Otherwise, use interactive mode (steps 4-7).

**Interactive Mode (default):**

4. **Analyze phase** — Identify domain and generate phase-specific gray areas
5. **Present gray areas** — Multi-select: which to discuss? (NO skip option)
6. **Deep-dive each area** — 4 questions per area, then offer more/next
7. **Write CONTEXT.md** — Sections match areas discussed
7.5. **Declare appetite** — Set appetite level (see Appetite Declaration section below)
7.75. **Pre-mortem risk analysis** — Run pre-mortem if gate enabled (see Pre-Mortem Risk Analysis section below)
8. **Offer next steps** (research or plan)

**Auto Mode (`--auto`):**

4a. **Analyze phase** — Same gray area identification as interactive mode
5a. **Auto-select all gray areas** — No user prompt, select everything
6a. **Load project identity from MuninnDB** — Extract project tech stack (languages, frameworks, conventions) via `muninn_recall_tree(vault: REPO_VAULT, id: "brain:project-identity")`
7a. **Spawn ALL researchers in PARALLEL (same message, multiple Task calls)** — For each gray area question, spawn a researcher:

    ```python
    # Spawn ALL researchers in PARALLEL (same message, multiple Task calls)
    For each gray_area question:
      Task(
        prompt="""
    <research_context>

    **Recipient:** phase-discuss orchestrator (report findings back to this orchestrator)

    **Phase:** {phase_number} - {phase_name}
    **Question:** {gray_area_question}
    **Tech stack:** {tech_stack_from_muninn}
    **Project context:** {project_identity_summary}

    </research_context>

    <analysis_targets>
    - Research this specific question for the phase context
    - Consider the project's tech stack when recommending solutions
    - Look for community best practices and common patterns
    </analysis_targets>

    <output_requirements>
    Return your findings in this format:
    <research_result>
    recommendation: [Your recommendation]
    confidence: HIGH | MEDIUM | LOW
    researchable: true | false
    sources: [List of sources/references]
    reasoning: [Why this recommendation]
    </research_result>
    </output_requirements>

    Research this question and provide a recommendation.
    """,
        subagent_type="<%= branding.commandPrefix %>-discuss-researcher",
        model="{researcher_model}",
        description="Research: {gray_area_topic}"
      )
    ```

    **Do NOT proceed until ALL Tasks return.**

    - Collect the `<research_result>` response from each researcher with recommendation, confidence, and sources
    - If `researchable: false`: flag for user input (even in auto mode)
8a. **Present research summary** — Show consolidated results:
    ```
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     <%= branding.frameworkName %> ► AUTO-DISCUSS RESULTS
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    | # | Gray Area | Recommendation | Confidence | Sources |
    |---|-----------|---------------|------------|---------|
    | 1 | {area}    | {rec}         | HIGH       | 2 cited |
    | 2 | {area}    | {rec}         | MEDIUM     | 1 cited |
    | 3 | {area}    | Not researchable | N/A     | —       |
    ```

    **Non-researchable items:** {list questions that need user input}
9a. **User override** — Even in auto mode, give user a chance to adjust:
    - Accept all: Use all researched recommendations
    - Override some: User provides answers for specific questions
    - Discuss instead: Switch to interactive mode for remaining items
10a. **Write CONTEXT.md** — Include provenance annotations:
    - `[researched]` — Decision from web research with cited sources
    - `[user-override]` — User overrode the researched recommendation
    - `[user-input]` — Non-researchable item answered by user
10.5a. **Declare appetite** — Set appetite level (see Appetite Declaration section below)
10.75a. **Pre-mortem risk analysis** — Run pre-mortem if gate enabled (see Pre-Mortem Risk Analysis section below)
11a. **Offer next steps** (research or plan)

## Critical: Scope Guardrail

- Phase boundary from ROADMAP.md is FIXED
- Discussion clarifies HOW to implement, not WHETHER to add more
- If user suggests new capabilities: "That's its own phase. I'll note it for later."
- Capture deferred ideas — don't lose them, don't act on them

## Domain-Aware Gray Areas

Gray areas depend on what's being built. Analyze the phase goal:

- Something users SEE → layout, density, interactions, states
- Something users CALL → responses, errors, auth, versioning
- Something users RUN → output format, flags, modes, error handling
- Something users READ → structure, tone, depth, flow
- Something being ORGANIZED → criteria, grouping, naming, exceptions

Generate 3-4 **phase-specific** gray areas, not generic categories.

## Probing Depth

Scale probing depth by complexity:
- MODERATE: 4 questions per area (standard)
- COMPLEX: 4-6 questions per area (extended)
- CRITICAL: 6+ questions per area (thorough)

Default:
- Ask 4 questions per area before checking
- "More questions about [area], or move to next?"
- If more → ask 4 more, check again
- After all areas → "Ready to create context?"

## Do NOT Ask About (AI handles these)

- Technical implementation
- Architecture choices
- Performance concerns
- Scope expansion

## Success Criteria

- [ ] Gray areas identified through intelligent analysis
- [ ] User chose which areas to discuss
- [ ] Each selected area explored until satisfied
- [ ] Scope creep redirected to deferred ideas
- [ ] CONTEXT.md captures decisions, not vague vision
- [ ] Appetite level declared and persisted via bridge
- [ ] Pre-mortem risk analysis completed or skipped (gate disabled)
- [ ] Self-tuning auto-skip checked signal rate aggregate before pre-mortem

## Appetite Declaration

After writing CONTEXT.md but before offering next steps, declare the appetite level for this phase. Appetite controls the investment ceiling — "fixed appetite, variable scope."

### Auto-inference (TRIVIAL / SIMPLE)

If complexity is TRIVIAL or SIMPLE, auto-set the appetite without prompting:

```bash
# TRIVIAL -> Micro, SIMPLE -> Small
if [ "$COMPLEXITY" = "TRIVIAL" ]; then
  APPETITE="Micro"
  CEILING=25000
  CONTEXT_PCT=30
elif [ "$COMPLEXITY" = "SIMPLE" ]; then
  APPETITE="Small"
  CEILING=50000
  CONTEXT_PCT=40
fi

luca-bridge set-field --field=appetite_level --value="\"$APPETITE\"" 2>/dev/null || true
luca-bridge set-field --field=appetite_token_ceiling --value=$CEILING 2>/dev/null || true
luca-bridge set-field --field=appetite_context_percent --value=$CONTEXT_PCT 2>/dev/null || true
```

Display confirmation:
```
Appetite auto-set to {APPETITE} (ceiling: {CEILING} tokens, context: {CONTEXT_PCT}%)
```

### Developer choice (MODERATE+)

For MODERATE, COMPLEX, and CRITICAL complexity, prompt the developer:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
<%= branding.frameworkName %> ► APPETITE DECLARATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
How much should <%= branding.frameworkName %> invest in this phase?

| Level  | Token Ceiling | Context % | Best For                    |
|--------|--------------|-----------|------------------------------|
| Micro  | 25,000       | 30%       | Trivial fixes, typos         |
| Small  | 50,000       | 40%       | Simple features, small bugs  |
| Medium | 100,000      | 50%       | Standard features            |
| Large  | 200,000      | 60%       | Cross-cutting changes        |
| XL     | 400,000      | 70%       | Major refactors, new systems |

Choose appetite level [Micro/Small/Medium/Large/XL]:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

After the developer responds, set via bridge:

```bash
luca-bridge set-field --field=appetite_level --value="\"$CHOSEN_LEVEL\"" 2>/dev/null || true
luca-bridge set-field --field=appetite_token_ceiling --value=$CHOSEN_CEILING 2>/dev/null || true
luca-bridge set-field --field=appetite_context_percent --value=$CHOSEN_CONTEXT_PCT 2>/dev/null || true
```

## Pre-Mortem Risk Analysis

After appetite declaration, run pre-mortem risk analysis to identify failure scenarios before planning begins. This step is gated on complexity and config.

### Gate Check (Flag-Based, Fail-Closed)

The premortem gate is resolved by the **lu orchestrator** and passed as an explicit flag. This skill does NOT resolve the gate itself.

```bash
# Check for orchestrator-supplied flag (fail-closed: absent flag = skip)
if echo "$ARGS" | grep -q -- "--run-premortem"; then
  PREMORTEM_GATE="true"
else
  # --skip-premortem OR no flag at all = skip (fail-closed)
  PREMORTEM_GATE="false"
fi
```

### Skip Conditions

Skip pre-mortem (no prompt, no spawn) if:
- `PREMORTEM_GATE` is "false" (either --skip-premortem was passed or no flag was present)

When skipping, emit DISCUSS_COMPLETE as normal and proceed to next steps.

### Self-Tuning Auto-Skip

If the orchestrator flag indicates premortem is enabled (`--run-premortem` was passed), check whether signal rate data suggests pre-mortem is not providing value:

1. Recall \`metric:signal-rate-aggregate\` from MuninnDB:
   \`\`\`
   mcp__muninn__muninn_recall(vault: REPO_VAULT, context: "metric:signal-rate-aggregate")
   \`\`\`

2. Parse the recalled engram. If the aggregate exists AND meets BOTH conditions:
   - \`sample_count >= 20\` (sufficient data from 20+ MODERATE+ runs)
   - \`rate < 0.10\` (less than 10% of pre-mortem risks resulted in useful mitigations)

   Then AUTO-SKIP pre-mortem:
   - Do NOT spawn <%= branding.commandPrefix %>-premortem
   - Store auto-skip decision as MuninnDB engram:
     \`\`\`
     mcp__muninn__muninn_remember(
       vault: DEFAULT_VAULT,
       concept: "process:auto-skip",
       content: "Pre-mortem auto-skipped: signal rate {rate} over {sample_count} runs. Threshold: <10% over 20+ runs."
     )
     \`\`\`
   - Log: "Pre-mortem auto-skipped (signal rate {rate} below threshold over {sample_count} runs)"
   - Proceed to next steps (emit DISCUSS_COMPLETE as normal)

3. If the aggregate does NOT exist or conditions are NOT met: proceed with pre-mortem as normal.

**Important:** The orchestrator flag takes precedence. If the orchestrator passed \`--skip-premortem\` (or no flag), pre-mortem never runs regardless of signal rate. Self-tuning only applies when \`--run-premortem\` was passed but data suggests low value.

### Execution (gate enabled)

1. **Spawn <%= branding.commandPrefix %>-premortem agent** via Task() with this context:

```
<premortem_context>
**Phase objective:** {phase objective from ROADMAP.md}
**Complexity:** {COMPLEXITY}
**Todo descriptions:** {summary of todos in this phase}
**CONTEXT.md path:** {path to the CONTEXT.md just written}
**Appetite:** {declared appetite level and ceiling}
</premortem_context>

Generate a Tier 1 Risk Brief for this phase. Analyze the codebase context and produce exactly 3 domain-specific failure scenarios.
```

2. **Present Risk Brief as developer checkpoint:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 <%= branding.frameworkName %> ► PRE-MORTEM RISK BRIEF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{Risk Brief content from <%= branding.commandPrefix %>-premortem agent}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Actions:
  [A] Approve — Write PREMORTEM.md and include constraints in planning
  [R] Reject  — Skip pre-mortem, proceed without risk constraints
  [M] Modify  — Adjust mitigations before approving
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

3. **Handle developer response:**

**Approve [A]:**
- Write the full Tier 2 PREMORTEM.md to `.planning/phases/{phase-dir}/PREMORTEM.md`
- Advance state machine via bridge: `luca-bridge transition --event=PREMORTEM_COMPLETE 2>/dev/null || true`
- Proceed to next steps

**Reject [R]:**
- Do not write PREMORTEM.md
- Log skip reason for summary
- Proceed to next steps (emit DISCUSS_COMPLETE as normal)

**Modify [M]:**
- Present the mitigations for editing
- Developer adjusts specific mitigations
- Then follow the Approve flow with modified content

## Next Steps

| Condition                         | Action              | Command                                 |
| --------------------------------- | ------------------- | --------------------------------------- |
| Context gathered, niche domain    | Research the domain | `/phase-research {phase}`         |
| Context gathered, standard domain | Plan the phase      | `/phase-plan {phase}`             |
| Want to review assumptions        | List assumptions    | `/phase-assumptions {phase}` |

**Primary:** `/phase-plan {phase}` — Create execution plans using gathered context

**Also available:**

- `/phase-research {phase}` — Deep research for niche/complex domains
- `/progress` — Check overall project status

</main>