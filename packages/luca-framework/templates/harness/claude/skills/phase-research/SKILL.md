# phase-research

Conduct comprehensive ecosystem research with parallel specialist agents (v2) or single researcher (v1).

## main

<main>
# <%= branding.frameworkName %> Research Phase

Comprehensive ecosystem research for niche/complex domains.

**Arguments:** `<phase number>`

## When to Use

Use for:

- 3D, games, audio, shaders, ML
- Specialized domains with non-obvious patterns
- Tech stacks you're unfamiliar with

Goes beyond "which library" to ecosystem knowledge:

- Standard architectures in the domain
- Expected features and behaviors
- Common pitfalls and anti-patterns

## Process

### Step 1: Load Phase Context

- Read ROADMAP.md for phase goal
- Read PROJECT.md for project context
- Read CONTEXT.md (if exists) for user decisions
- Read existing research (if any)

Determine the phase directory:

```bash
PADDED_PHASE=$(printf "%02d" $PHASE 2>/dev/null || echo "$PHASE")
PHASE_DIR=$(ls -d .planning/phases/$PADDED_PHASE-* .planning/phases/$PHASE-* 2>/dev/null | head -1)
```

### Step 2: Detect v2 Mode

Read `.planning/config.json` for `workflow.version` field.

```bash
VERSION=$(bun -e "const c=JSON.parse(require('fs').readFileSync('.planning/config.json','utf8')); console.log(c.workflow?.version ?? 'v1')" 2>/dev/null || echo "v1")
```

**If `workflow.version == "v2"`:** Use v2 multi-agent research (Step 3a)
**Otherwise:** Use v1 single-agent research (Step 3b)

### Step 3a: v2 Multi-Agent Research

1. **Create research directory:**
   ```bash
   mkdir -p "$PHASE_DIR/research"
   ```

2. **Write 00-brief.md** with phase description, intent, and constraints from CONTEXT.md:
   ```markdown
   # Research Brief: Phase {N} - {Name}

   ## Phase Description
   [From ROADMAP.md]

   ## Intent
   [What this phase aims to achieve]

   ## Constraints
   [From CONTEXT.md decisions, if exists]

   ## Research Scope
   [What the 4 researchers should investigate]
   ```

3. **Spawn 4 researchers in parallel via Task():**

   Each Task() receives the phase description, CONTEXT.md constraints, and output file path.

   | Agent | Output File | Focus |
   |-------|-------------|-------|
   | <%= branding.commandPrefix %>-architecture-researcher | `$PHASE_DIR/research/01-architecture-patterns.md` | System design, patterns, structure |
   | <%= branding.commandPrefix %>-implementation-researcher | `$PHASE_DIR/research/02-implementation-approaches.md` | APIs, code patterns, configuration |
   | <%= branding.commandPrefix %>-ecosystem-researcher | `$PHASE_DIR/research/03-existing-solutions.md` | Libraries, community, state of art |
   | <%= branding.commandPrefix %>-risk-researcher | `$PHASE_DIR/research/04-pitfalls-and-risks.md` | Pitfalls, failures, security, perf |

   **Spawn ALL 4 researchers in PARALLEL (same message, multiple Task calls):**

   ```python
   # Agent 1: Architecture Researcher
   Task(
     prompt="""
<research_context>

**Recipient:** phase-research orchestrator (report findings back to this orchestrator)

**Phase:** {N} - {phase_name}
**Description:** {phase_description}
**Constraints:** {context_md_decisions}
**Output file:** $PHASE_DIR/research/01-architecture-patterns.md

</research_context>

<analysis_targets>
- System design patterns applicable to this phase
- Architecture approaches and structural decisions
- Component boundaries and interaction patterns
- Scalability and maintainability considerations
</analysis_targets>

<output_requirements>
- Write findings to $PHASE_DIR/research/01-architecture-patterns.md
- Include confidence level (HIGH/MEDIUM/LOW) for each finding
- Include cited sources where applicable
- Return confirmation with document line count
</output_requirements>

Research system design and architecture patterns for this phase. Write your findings to the output file.
""",
     subagent_type="<%= branding.commandPrefix %>-architecture-researcher",
     model="{researcher_model}",
     description="Architecture research"
   )

   # Agent 2: Implementation Researcher
   Task(
     prompt="""
<research_context>

**Recipient:** phase-research orchestrator (report findings back to this orchestrator)

**Phase:** {N} - {phase_name}
**Description:** {phase_description}
**Constraints:** {context_md_decisions}
**Output file:** $PHASE_DIR/research/02-implementation-approaches.md

</research_context>

<analysis_targets>
- API patterns and code-level implementation approaches
- Configuration and setup requirements
- Integration patterns with existing codebase
- Code examples and reference implementations
</analysis_targets>

<output_requirements>
- Write findings to $PHASE_DIR/research/02-implementation-approaches.md
- Include confidence level (HIGH/MEDIUM/LOW) for each finding
- Include cited sources where applicable
- Return confirmation with document line count
</output_requirements>

Research APIs, code patterns, and implementation approaches for this phase. Write your findings to the output file.
""",
     subagent_type="<%= branding.commandPrefix %>-implementation-researcher",
     model="{researcher_model}",
     description="Implementation research"
   )

   # Agent 3: Ecosystem Researcher
   Task(
     prompt="""
<research_context>

**Recipient:** phase-research orchestrator (report findings back to this orchestrator)

**Phase:** {N} - {phase_name}
**Description:** {phase_description}
**Constraints:** {context_md_decisions}
**Output file:** $PHASE_DIR/research/03-existing-solutions.md

</research_context>

<analysis_targets>
- Existing libraries and tools in this domain
- Community best practices and conventions
- State of the art and recent developments
- Comparison of available solutions with trade-offs
</analysis_targets>

<output_requirements>
- Write findings to $PHASE_DIR/research/03-existing-solutions.md
- Include confidence level (HIGH/MEDIUM/LOW) for each finding
- Include cited sources where applicable
- Return confirmation with document line count
</output_requirements>

Research existing solutions, libraries, and community practices for this phase. Write your findings to the output file.
""",
     subagent_type="<%= branding.commandPrefix %>-ecosystem-researcher",
     model="{researcher_model}",
     description="Ecosystem research"
   )

   # Agent 4: Risk Researcher
   Task(
     prompt="""
<research_context>

**Recipient:** phase-research orchestrator (report findings back to this orchestrator)

**Phase:** {N} - {phase_name}
**Description:** {phase_description}
**Constraints:** {context_md_decisions}
**Output file:** $PHASE_DIR/research/04-pitfalls-and-risks.md

</research_context>

<analysis_targets>
- Common pitfalls and failure modes in this domain
- Security considerations and vulnerabilities
- Performance risks and bottlenecks
- Migration and compatibility risks
</analysis_targets>

<output_requirements>
- Write findings to $PHASE_DIR/research/04-pitfalls-and-risks.md
- Include confidence level (HIGH/MEDIUM/LOW) for each finding
- Include cited sources where applicable
- Return confirmation with document line count
</output_requirements>

Research pitfalls, risks, security concerns, and failure modes for this phase. Write your findings to the output file.
""",
     subagent_type="<%= branding.commandPrefix %>-risk-researcher",
     model="{researcher_model}",
     description="Risk research"
   )
   ```

   **Do NOT proceed until ALL 4 Tasks return.**

4. **Collect results and present summary:**
   ```
   ## v2 Research Complete

   **Phase:** {N} - {name}
   **Research directory:** {phase_dir}/research/

   ### Files Created
   - 00-brief.md (research brief)
   - 01-architecture-patterns.md (architecture researcher)
   - 02-implementation-approaches.md (implementation researcher)
   - 03-existing-solutions.md (ecosystem researcher)
   - 04-pitfalls-and-risks.md (risk researcher)

   ### Per-Researcher Confidence
   | Researcher | Status | Confidence |
   |-----------|--------|-----------|
   | Architecture | [complete/partial] | [from file] |
   | Implementation | [complete/partial] | [from file] |
   | Ecosystem | [complete/partial] | [from file] |
   | Risk | [complete/partial] | [from file] |

   ## Next Up
   /phase-plan {N} -- plan with research context
   ```

### Step 3b: v1 Single-Agent Research (Default)

1. **Spawn researcher:**
   - Use <%= branding.commandPrefix %>-phase-researcher agent via Task() with `**Recipient:** phase-research orchestrator`
   - Focus on ecosystem knowledge for the domain

2. **Create RESEARCH.md:**
   - Location: `$PHASE_DIR/{phase}-RESEARCH.md`
   - Include: stack recommendations, architecture patterns, pitfalls

3. **Present findings:**
   ```
   ## Research Complete

   **Domain:** {domain}
   **File:** {phase_dir}/{phase}-RESEARCH.md

   ### Key Findings

   **Stack:** {recommended approach}
   **Patterns:** {standard architecture}
   **Watch Out:** {common pitfalls}

   ## Next Up
   /phase-plan {N} -- plan with research context
   ```

## Success Criteria

### v2 Mode
- [ ] Phase context loaded
- [ ] Research directory created
- [ ] 00-brief.md written
- [ ] 4 researchers spawned in parallel
- [ ] All 4 research files created
- [ ] Summary with per-researcher confidence presented

### v1 Mode (Default)
- [ ] Phase context loaded
- [ ] Researcher agent spawned
- [ ] RESEARCH.md created with domain knowledge
- [ ] Stack recommendations specific and versioned
- [ ] Pitfalls actionable with prevention strategies

## Next Steps

**Primary:** `/phase-plan {phase}` -- Create plans using research findings

**Also available:**

- `/phase-assumptions {phase}` -- Review what AI plans to do
- `/progress` -- Check overall project status
</main>