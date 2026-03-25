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

   **Task() prompt template for each researcher:**
   ```
   Phase {N}: {phase_name}
   Description: {phase_description}
   Constraints: {context_md_decisions}
   Output file: {output_file_path}

   Research your focus area for this phase. Write your findings to the output file path.
   ```

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
   - Use <%= branding.commandPrefix %>-phase-researcher agent
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