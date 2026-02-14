<purpose>
Extract implementation decisions that downstream agents need. Analyze the phase to identify gray areas, let the user choose what to discuss, then deep-dive each selected area until satisfied.

You are a thinking partner, not an interviewer. The user is the visionary — you are the builder. Your job is to capture decisions that will guide research and planning, not to figure out implementation yourself.
</purpose>

<downstream_awareness>
**CONTEXT.md feeds into:**

1. **lu-phase-researcher** — Reads CONTEXT.md to know WHAT to research
   - "User wants card-based layout" → researcher investigates card component patterns
   - "Infinite scroll decided" → researcher looks into virtualization libraries

2. **lu-planner** — Reads CONTEXT.md to know WHAT decisions are locked
   - "Pull-to-refresh on mobile" → planner includes that in task specs
   - "Claude's Discretion: loading skeleton" → planner can decide approach

**Your job:** Capture decisions clearly enough that downstream agents can act on them without asking the user again.

**Not your job:** Figure out HOW to implement. That's what research and planning do with the decisions you capture.
</downstream_awareness>

<philosophy>
**User = founder/visionary. Claude = builder.**

The user knows:

- How they imagine it working
- What it should look/feel like
- What's essential vs nice-to-have
- Specific behaviors or references they have in mind

The user doesn't know (and shouldn't be asked):

- Codebase patterns (researcher reads the code)
- Technical risks (researcher identifies these)
- Implementation approach (planner figures this out)
- Success metrics (inferred from the work)

Ask about vision and implementation choices. Capture decisions for downstream agents.
</philosophy>

<scope_guardrail>
**CRITICAL: No scope creep.**

The phase boundary comes from ROADMAP.md and is FIXED. Discussion clarifies HOW to implement what's scoped, never WHETHER to add new capabilities.

**Allowed (clarifying ambiguity):**

- "How should posts be displayed?" (layout, density, info shown)
- "What happens on empty state?" (within the feature)
- "Pull to refresh or manual?" (behavior choice)

**Not allowed (scope creep):**

- "Should we also add comments?" (new capability)
- "What about search/filtering?" (new capability)
- "Maybe include bookmarking?" (new capability)

**The heuristic:** Does this clarify how we implement what's already in the phase, or does it add a new capability that could be its own phase?

**When user suggests scope creep:**

```
"[Feature X] would be a new capability — that's its own phase.
Want me to note it for the roadmap backlog?

For now, let's focus on [phase domain]."
```

Capture the idea in a "Deferred Ideas" section. Don't lose it, don't act on it.
</scope_guardrail>

<gray_area_identification>
Gray areas are **implementation decisions the user cares about** — things that could go multiple ways and would change the result.

**How to identify gray areas:**

1. **Read the phase goal** from ROADMAP.md
2. **Understand the domain** — What kind of thing is being built?
   - Something users SEE → visual presentation, interactions, states matter
   - Something users CALL → interface contracts, responses, errors matter
   - Something users RUN → invocation, output, behavior modes matter
   - Something users READ → structure, tone, depth, flow matter
   - Something being ORGANIZED → criteria, grouping, handling exceptions matter
3. **Generate phase-specific gray areas** — Not generic categories, but concrete decisions for THIS phase

**Don't use generic category labels** (UI, UX, Behavior). Generate specific gray areas:

```
Phase: "User authentication"
→ Session handling, Error responses, Multi-device policy, Recovery flow

Phase: "Organize photo library"
→ Grouping criteria, Duplicate handling, Naming convention, Folder structure

Phase: "CLI for database backups"
→ Output format, Flag design, Progress reporting, Error recovery

Phase: "API documentation"
→ Structure/navigation, Code examples depth, Versioning approach, Interactive elements
```

**The key question:** What decisions would change the outcome that the user should weigh in on?

**Claude handles these (don't ask):**

- Technical implementation details
- Architecture patterns
- Performance optimization
- Scope (roadmap defines this)
  </gray_area_identification>

<process>

<step name="auto_mode_check" priority="first">
Check if the `--auto` flag was passed in arguments.

**If `--auto` is present:**

- Set AUTO_MODE=true
- After validate_phase and check_existing, skip present_gray_areas and discuss_areas
- Instead, follow: analyze_phase → auto_select → auto_research → present_summary → user_override → write_context

**If `--auto` is NOT present:**

- Set AUTO_MODE=false
- Follow normal interactive flow (existing steps below)
  </step>

<step name="validate_phase">
Phase number from argument (required).

Load and validate:

- Read `.planning/ROADMAP.md`
- Find phase entry
- Extract: number, name, description, status

**If phase not found:**

```
Phase [X] not found in roadmap.

Use /lu-progress to see available phases.
```

Exit workflow.

**If phase found:** Continue to analyze_phase.
</step>

<step name="check_existing">
Check if CONTEXT.md already exists:

```bash
# Match both zero-padded (05-*) and unpadded (5-*) folders
PADDED_PHASE=$(printf "%02d" ${PHASE})
ls .planning/phases/${PADDED_PHASE}-*/*-CONTEXT.md .planning/phases/${PHASE}-*/*-CONTEXT.md 2>/dev/null
```

**If exists:**
Use AskQuestion:

- header: "Existing context"
- question: "Phase [X] already has context. What do you want to do?"
- options:
  - "Update it" — Review and revise existing context
  - "View it" — Show me what's there
  - "Skip" — Use existing context as-is

If "Update": Load existing, continue to analyze_phase
If "View": Display CONTEXT.md, then offer update/skip
If "Skip": Exit workflow

**If doesn't exist:** Continue to analyze_phase.
</step>

<step name="analyze_phase">
Analyze the phase to identify gray areas worth discussing.

**Read the phase description from ROADMAP.md and determine:**

1. **Domain boundary** — What capability is this phase delivering? State it clearly.

2. **Gray areas by category** — For each relevant category (UI, UX, Behavior, Empty States, Content), identify 1-2 specific ambiguities that would change implementation.

3. **Skip assessment** — If no meaningful gray areas exist (pure infrastructure, clear-cut implementation), the phase may not need discussion.

**Output your analysis internally, then present to user.**

Example analysis for "Post Feed" phase:

```
Domain: Displaying posts from followed users
Gray areas:
- UI: Layout style (cards vs timeline vs grid)
- UI: Information density (full posts vs previews)
- Behavior: Loading pattern (infinite scroll vs pagination)
- Empty State: What shows when no posts exist
- Content: What metadata displays (time, author, reactions count)
```

</step>

<step name="present_gray_areas">
Present the domain boundary and gray areas to user.

**First, state the boundary:**

```
Phase [X]: [Name]
Domain: [What this phase delivers — from your analysis]

We'll clarify HOW to implement this.
(New capabilities belong in other phases.)
```

**Then use AskQuestion (multiSelect: true):**

- header: "Discuss"
- question: "Which areas do you want to discuss for [phase name]?"
- options: Generate 3-4 phase-specific gray areas, each formatted as:
  - "[Specific area]" (label) — concrete, not generic
  - [1-2 questions this covers] (description)

**Do NOT include a "skip" or "you decide" option.** User ran this command to discuss — give them real choices.

**Examples by domain:**

For "Post Feed" (visual feature):

```
☐ Layout style — Cards vs list vs timeline? Information density?
☐ Loading behavior — Infinite scroll or pagination? Pull to refresh?
☐ Content ordering — Chronological, algorithmic, or user choice?
☐ Post metadata — What info per post? Timestamps, reactions, author?
```

For "Database backup CLI" (command-line tool):

```
☐ Output format — JSON, table, or plain text? Verbosity levels?
☐ Flag design — Short flags, long flags, or both? Required vs optional?
☐ Progress reporting — Silent, progress bar, or verbose logging?
☐ Error recovery — Fail fast, retry, or prompt for action?
```

For "Organize photo library" (organization task):

```
☐ Grouping criteria — By date, location, faces, or events?
☐ Duplicate handling — Keep best, keep all, or prompt each time?
☐ Naming convention — Original names, dates, or descriptive?
☐ Folder structure — Flat, nested by year, or by category?
```

Continue to discuss_areas with selected areas.
</step>

<step name="discuss_areas">
For each selected area, conduct a focused discussion loop.

**Philosophy: 4 questions, then check.**

Ask 4 questions per area before offering to continue or move on. Each answer often reveals the next question.

**For each area:**

1. **Announce the area:**

   ```
   Let's talk about [Area].
   ```

2. **Ask 4 questions using AskQuestion:**
   - header: "[Area]"
   - question: Specific decision for this area
   - options: 2-3 concrete choices (AskQuestion adds "Other" automatically)
   - Include "You decide" as an option when reasonable — captures Claude discretion

3. **After 4 questions, check:**
   - header: "[Area]"
   - question: "More questions about [area], or move to next?"
   - options: "More questions" / "Next area"

   If "More questions" → ask 4 more, then check again
   If "Next area" → proceed to next selected area

4. **After all areas complete:**
   - header: "Done"
   - question: "That covers [list areas]. Ready to create context?"
   - options: "Create context" / "Revisit an area"

**Question design:**

- Options should be concrete, not abstract ("Cards" not "Option A")
- Each answer should inform the next question
- If user picks "Other", receive their input, reflect it back, confirm

**Scope creep handling:**
If user mentions something outside the phase domain:

```
"[Feature] sounds like a new capability — that belongs in its own phase.
I'll note it as a deferred idea.

Back to [current area]: [return to current question]"
```

Track deferred ideas internally.
</step>

<step name="auto_select">
**Only runs when AUTO_MODE=true.**

Auto-select ALL gray areas identified in analyze_phase. No user prompt needed.

Display:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► AUTO-DISCUSS: Phase {X}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Auto-selecting all {N} gray areas for research
◆ Areas: {list of gray area names}
```

</step>

<step name="auto_research">
**Only runs when AUTO_MODE=true.**

For each gray area, spawn a `lu-discuss-researcher` agent to research it.

### Step 1: Read BRAIN.md for tech stack context

```bash
BRAIN_CONTENT=$(cat .planning/BRAIN.md 2>/dev/null || echo "No BRAIN.md found")
```

Extract the Stack section for tech stack constraints.

### Step 2: Spawn researchers per gray area

For each gray area identified in analyze_phase:

1. Formulate a focused question from the gray area topic and phase context
2. Spawn the researcher:

```python
Task(
  prompt="""
<discuss_research_context>
**Gray Area Question:** {question}

**Phase:** {phase_number} — {phase_name}
**Phase Goal:** {phase_goal from roadmap}

**Project Tech Stack (from BRAIN.md):**
{brain_stack_section}
</discuss_research_context>

Research this gray area question for the phase described above. Return your recommendation in the <research_result> format.
""",
  subagent_type="lu-discuss-researcher",
  description="Research: {gray_area_name}"
)
```

3. Collect the `<research_result>` response from each agent
4. Parse: recommendation, confidence, sources, researchable flag

### Step 3: Identify non-researchable items

If any results have `researchable: false`:

- These need user input even in auto mode
- Collect them for the user_override step
  </step>

<step name="present_summary">
**Only runs when AUTO_MODE=true.**

Display consolidated research results:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► AUTO-DISCUSS RESULTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| # | Gray Area | Recommendation | Confidence | Sources |
|---|-----------|---------------|------------|---------|
| 1 | {area}    | {short rec}   | HIGH       | 2 cited |
| 2 | {area}    | {short rec}   | MEDIUM     | 1 cited |
| 3 | {area}    | Not researchable | N/A     | —       |
```

**For each HIGH/MEDIUM recommendation:** Show the full rationale and sources.

**For non-researchable items:** Flag them clearly:

```
⚠ Non-researchable items (need your input):
  - {question}: This is a user preference question
```

</step>

<step name="user_override">
**Only runs when AUTO_MODE=true.**

Even in auto mode, give the user a chance to adjust:

Use AskQuestion:

- header: "Auto-discuss"
- question: "Research complete. How would you like to proceed?"
- options:
  - "Accept all" — Use all researched recommendations as-is
  - "Override some" — Let me provide answers for specific questions
  - "Discuss instead" — Switch to interactive discussion mode

**If "Accept all":** Proceed to write_context with all researched decisions.

**If "Override some":**

- Present each recommendation and ask if user agrees or wants to override
- For each override: capture user's preference instead of research recommendation
- Mark overridden items with `[user-override]` provenance

**If "Discuss instead":** Switch to interactive mode — present_gray_areas → discuss_areas flow.

**For non-researchable items (if any):**

- Always prompt the user for these, regardless of choice above
- Use AskQuestion with the non-researchable question and suggested options
  </step>

<step name="write_context">
Create CONTEXT.md capturing decisions made.

**Find or create phase directory:**

```bash
# Match existing directory (padded or unpadded)
PADDED_PHASE=$(printf "%02d" ${PHASE})
PHASE_DIR=$(ls -d .planning/phases/${PADDED_PHASE}-* .planning/phases/${PHASE}-* 2>/dev/null | head -1)
if [ -z "$PHASE_DIR" ]; then
  # Create from roadmap name (lowercase, hyphens)
  PHASE_NAME=$(grep "Phase ${PHASE}:" .planning/ROADMAP.md | sed 's/.*Phase [0-9]*: //' | tr '[:upper:]' '[:lower:]' | tr ' ' '-')
  mkdir -p ".planning/phases/${PADDED_PHASE}-${PHASE_NAME}"
  PHASE_DIR=".planning/phases/${PADDED_PHASE}-${PHASE_NAME}"
fi
```

**File location:** `${PHASE_DIR}/${PADDED_PHASE}-CONTEXT.md`

**Structure the content by what was discussed:**

```markdown
# Phase [X]: [Name] - Context

**Gathered:** [date]
**Status:** Ready for planning

<domain>
## Phase Boundary

[Clear statement of what this phase delivers — the scope anchor]

</domain>

<decisions>
## Implementation Decisions

### [Category 1 that was discussed]

- [Decision or preference captured]
- [Another decision if applicable]

### [Category 2 that was discussed]

- [Decision or preference captured]

### Claude's Discretion

[Areas where user said "you decide" — note that Claude has flexibility here]

**Auto Mode Provenance (only when AUTO_MODE=true):**

Annotate each decision with its source:

- `[researched]` — Decision from lu-discuss-researcher web research (include confidence level and source count)
- `[user-override]` — User overrode the researched recommendation
- `[user-input]` — Non-researchable item answered by user directly

Example:
```

### Loading Behavior

- Use infinite scroll with virtualization [researched, HIGH, 2 sources]
- Show skeleton loading during fetch [researched, MEDIUM, 1 source]

### Color Theme

- Use dark mode as default [user-input] (non-researchable: aesthetic preference)

```

</decisions>

<specifics>
## Specific Ideas

[Any particular references, examples, or "I want it like X" moments from discussion]

[If none: "No specific requirements — open to standard approaches"]

</specifics>

<deferred>
## Deferred Ideas

[Ideas that came up but belong in other phases. Don't lose them.]

[If none: "None — discussion stayed within phase scope"]

</deferred>

---

_Phase: XX-name_
_Context gathered: [date]_
```

Write file.
</step>

<step name="confirm_creation">
Present summary and next steps:

```
Created: .planning/phases/${PADDED_PHASE}-${SLUG}/${PADDED_PHASE}-CONTEXT.md

## Decisions Captured

### [Category]
- [Key decision]

### [Category]
- [Key decision]

[If deferred ideas exist:]
## Noted for Later
- [Deferred idea] — future phase

---

## ▶ Next Up

**Phase ${PHASE}: [Name]** — [Goal from ROADMAP.md]

`/lu-plan-phase ${PHASE}`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/lu-plan-phase ${PHASE} --skip-research` — plan without research
- Review/edit CONTEXT.md before continuing

---
```

</step>

<step name="git_commit">
Commit phase context:

**Check planning config:**

```bash
COMMIT_PLANNING_DOCS=$(cat .planning/config.json 2>/dev/null | grep -o '"commit_docs"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "true")
git check-ignore -q .planning 2>/dev/null && COMMIT_PLANNING_DOCS=false
```

**If `COMMIT_PLANNING_DOCS=false`:** Skip git operations

**If `COMMIT_PLANNING_DOCS=true` (default):**

```bash
git add "${PHASE_DIR}/${PADDED_PHASE}-CONTEXT.md"
git commit -m "$(cat <<'EOF'
docs(${PADDED_PHASE}): capture phase context

Phase ${PADDED_PHASE}: ${PHASE_NAME}
- Implementation decisions documented
- Phase boundary established
EOF
)"
```

Confirm: "Committed: docs(${PADDED_PHASE}): capture phase context"
</step>

</process>

<success_criteria>

- Phase validated against roadmap
- Gray areas identified through intelligent analysis (not generic questions)
- User selected which areas to discuss
- Each selected area explored until user satisfied
- Scope creep redirected to deferred ideas
- CONTEXT.md captures actual decisions, not vague vision
- Deferred ideas preserved for future phases
- User knows next steps
  </success_criteria>
