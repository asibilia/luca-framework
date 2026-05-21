---
id: 20-04
title: "/lu Skill Chaining Rewrite"
phase: 20-skills-agents-packaging
wave: 2
delivers: PACK-03 (partial)
depends_on: "20-01"
tasks: 3
---

# Plan 20-04: /lu Skill Chaining Rewrite

## Objective

Rewrite the `/lu` skill to act as a routing orchestrator that invokes sub-skills via the Skill tool instead of inlining their behavior. Currently, `/lu` describes the full workflow inline in its skill body, meaning Claude executes all steps within a single skill context. Users miss the visual skill headers, complexity gating prompts, and structured flow that come from proper skill invocation. After this rewrite, `/lu` will classify the task, then explicitly instruct Claude to invoke the appropriate sub-skill(s) using the Skill tool.

## Context

- **Current problem**: `src/skills/luca/lu.skill.ts` has 3 sections (`main`, `sub-agent_delegation_requirements`, `workflow`) that describe the entire Luca workflow inline. Claude reads these instructions and tries to execute the whole pipeline within the `/lu` skill context. This means sub-skills like `lu-discuss-phase`, `lu-plan-phase`, `lu-execute-phase` never get their own skill invocation — their headers, gating, and structured instructions are never loaded.
- **Root cause**: The workflow section describes the pipeline as a flowchart but never instructs Claude to use the Skill tool to invoke sub-skills.
- **Skill tool invocation**: Within a skill's execution context, Claude has access to the Skill tool. Invoking `Skill(skill: "lu-plan-phase", args: "20")` loads that skill's SKILL.md and gives it a proper visual header.
- **Desired behavior**: `/lu` should be a lightweight router that:
  1. Parses the user's request (task description, Jira URL, ticket ID, flags)
  2. Sets up git context (branch) if needed
  3. Invokes lu-cognition agent for pre-flight (via Task tool)
  4. Classifies complexity (via lu-router agent or `--complexity` flag)
  5. Based on complexity and task type, invokes the appropriate sub-skill(s) via Skill tool
  6. After execution, invokes lu-verifier agent (via Task tool)
  7. After verification, invokes lu-learner agent (via Task tool)
- **Dependency on 20-01**: The consolidated `lu.skill.ts` from Plan 20-01 is the file we modify. Plan 20-01 removes the duplicate in `general/` and keeps `luca/lu.skill.ts` as authoritative.
- **Agent delegation is correct**: The skill correctly uses the Task tool for agents (lu-verifier, lu-learner, lu-cognition, lu-router). The fix is about using the Skill tool for sub-skills (lu-discuss-phase, lu-plan-phase, lu-execute-phase, etc.).
- **Skill tool syntax**: In Claude Code, the Skill tool is invoked as: `Skill(skill: "skill-name", args: "optional arguments")`

## Files

### Modify

- `src/skills/luca/lu.skill.ts` — Rewrite all sections to implement routing with Skill tool invocations

## Tasks

### Task 1: Rewrite the main section with routing instructions

**Goal:** Replace the current `main` section content with a concise routing overview that tells Claude to parse the request and route to the appropriate handler.

**File:** `src/skills/luca/lu.skill.ts` (modify)

**Instructions:**

Replace the `main` section (section index 0, title `'main'`) content with:

```
The single entry point for all Luca workflows. This is a **routing skill** — it classifies the task and invokes the appropriate sub-skill via the Skill tool.

**Arguments:** \`<task-description | Jira-URL | [TICKET-ID]> [--complexity=TRIVIAL|SIMPLE|MODERATE|COMPLEX|CRITICAL] [--force-complex] [--skip-memory] [--skip-branch]\`

> **Note:** Replace \`[TICKET-ID]\` with your project's configured ticket pattern (e.g., \`PROJ-123\`, \`PT-123\`, or your custom \`ticketPattern\` from \`.planning/config.json\`). Default pattern: \`[A-Z]+-\\d+\`

**CRITICAL:** You are a router. Do NOT execute workflow steps yourself. Invoke sub-skills and sub-agents as described below.
```

Also remove the `# Luca - Unified Entry Point` H1 heading from the content since `toClaudeFormat()` automatically generates `# lu` as the heading.

**Verification:**

- Main section is concise (no inline workflow execution)
- Emphasizes routing role
- Preserves argument documentation

### Task 2: Rewrite the workflow section with Skill tool routing table

**Goal:** Replace the flowchart-based workflow section with a concrete routing table that tells Claude exactly which Skill/Task tool invocations to make for each scenario.

**File:** `src/skills/luca/lu.skill.ts` (modify)

**Instructions:**

Replace the `workflow` section (section index 2, title `'workflow'`) content entirely. The new content should be structured as follows:

```markdown
## Routing Procedure

Execute these steps in order. Each step is either a Task tool call (for agents) or a Skill tool call (for sub-skills).

### Step 0: Parse Request

Determine:

- **Task type**: New project, phase work, PR review, debug, quick task, or session planning
- **Complexity override**: Check for `--complexity=<level>` or `--force-complex` flags
- **Git context**: Check for Jira URL, ticket ID, or plain task description
- **Skip flags**: `--skip-memory`, `--skip-branch`

### Step 1: Git Context Setup (if applicable)

If the request includes a Jira ticket or URL and `--skip-branch` is NOT set:

1. Check if a GitHub issue exists for this ticket
2. If not, invoke: `Skill(skill: "jira-issue", args: "<ticket-id>")`
3. Create or switch to the feature branch: `Skill(skill: "git-feature", args: "<ticket-id>")`

If already on a feature branch or `--skip-branch` is set, skip this step.

### Step 2: Cognitive Pre-Flight (if applicable)

Unless `--skip-memory` is set, spawn the lu-cognition agent:
```

Task(agent: "lu-cognition", prompt: "Run cognitive pre-flight for task: <task-description>. Load BRAIN.md, recall relevant MEMORY.md entries, initialize WORKING.md.")

```

### Step 3: Complexity Classification

If `--complexity=<level>` was passed, use that level directly. Write it to STATE.md.

If `--force-complex` was passed, use COMPLEX.

Otherwise, spawn lu-router to classify:

```

Task(agent: "lu-router", prompt: "Classify complexity for task: <task-description>. Output: TRIVIAL, SIMPLE, MODERATE, COMPLEX, or CRITICAL.")

```

### Step 4: Route to Handler (via Skill tool)

Based on the classified complexity and task type, invoke the appropriate skill:

**New project initialization:**
```

Skill(skill: "lu-new-project", args: "<project description>")

```

**New milestone:**
```

Skill(skill: "lu-new-milestone", args: "<milestone description>")

```

**TRIVIAL / SIMPLE tasks:**
```

Skill(skill: "lu-quick", args: "<task-description>")

```

**MODERATE tasks (single phase):**
1. `Skill(skill: "lu-discuss-phase", args: "<phase-number>")`
2. `Skill(skill: "lu-plan-phase", args: "<phase-number>")`
3. `Skill(skill: "lu-execute-phase", args: "<phase-number>")`

**COMPLEX / CRITICAL tasks (full pipeline):**
1. `Skill(skill: "lu-research-phase", args: "<phase-number>")` — if domain is unfamiliar
2. `Skill(skill: "lu-discuss-phase", args: "<phase-number>")`
3. `Skill(skill: "lu-plan-phase", args: "<phase-number>")`
4. `Skill(skill: "lu-execute-phase", args: "<phase-number>")`

**PR review work:**
```

Skill(skill: "lu-address-pr", args: "<pr-url>")

```

**Debug workflow:**
```

Skill(skill: "lu-debug", args: "<bug-description>")

```

**Session planning:**
```

Skill(skill: "lu-plan-session")

```

**Progress check:**
```

Skill(skill: "lu-progress")

```

### Step 5: Verification (always runs)

After the handler skill completes, spawn lu-verifier:

```

Task(agent: "lu-verifier", prompt: "Verify the work completed for task: <task-description>. Check against acceptance criteria and requirements.")

```

### Step 6: Learning Capture (complexity-gated)

For MODERATE+ complexity, spawn lu-learner:

```

Task(agent: "lu-learner", model: "fast", prompt: "Extract learnings from completed task: <task-description>. Capture patterns, decisions, and pitfalls to MEMORY.md.")

```

For TRIVIAL/SIMPLE: Skip learning capture.

### Step 7: Commit (if on feature branch)

If on a feature branch with uncommitted changes:
```

Skill(skill: "git-commit", args: "--no-push")

```

### Complexity Override

If `--complexity=<level>` is passed:
1. Skip lu-router classification
2. Use the specified level directly
3. Look up gated steps from the complexity matrix in config.json
4. Persist to STATE.md `Task Complexity:` field

If `--force-complex` is passed (backward compatibility):
- Equivalent to `--complexity=COMPLEX`
```

The above is the conceptual content. Encode it as a template literal string in the `sections[2].content` field, with proper escaping for backticks (use `\\\`` for backtick sequences inside the template literal).

**Important escaping notes:**

- Single backticks in markdown: `\\\``
- Triple backtick code fences: Use `\\\`\\\`\\\``
- Dollar signs: `\$` (already the pattern in the existing file)
- Follow the existing escaping conventions in the file

**Verification:**

- Workflow section contains explicit Skill tool invocations for each routing scenario
- Task tool invocations used for agents (lu-cognition, lu-router, lu-verifier, lu-learner)
- Skill tool invocations used for sub-skills (lu-discuss-phase, lu-plan-phase, lu-execute-phase, etc.)
- All routing scenarios covered (new project, milestone, trivial, moderate, complex, PR, debug, session)
- Complexity override section preserved
- Template literal compiles without errors

### Task 3: Simplify the sub-agent delegation section and build-verify

**Goal:** Streamline the `sub-agent_delegation_requirements` section to remove redundancy with the new workflow routing section. Then verify the full build.

**File:** `src/skills/luca/lu.skill.ts` (modify)

**Instructions:**

1. Replace the `sub-agent_delegation_requirements` section (section index 1) content with a shorter version that complements (not duplicates) the routing section:

````markdown
## Delegation Architecture

This skill uses TWO delegation mechanisms:

**Skill tool** — for workflow sub-skills (lu-discuss-phase, lu-plan-phase, lu-execute-phase, etc.)

- Invoke: `Skill(skill: "skill-name", args: "...")`
- Each invoked skill loads its own SKILL.md with full instructions
- Users see visual skill headers for each step

**Task tool** — for specialized agents (lu-cognition, lu-router, lu-verifier, lu-learner)

- Invoke: `Task(agent: "agent-name", prompt: "...")`
- Agents run as sub-agents within the current context

### Model Resolution

Resolve models before spawning agents:

```bash
MODEL_PROFILE=$(cat .planning/config.json 2>/dev/null | grep -o '"model_profile"[[:space]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "balanced")
```
````

| Agent       | quality | balanced | budget |
| ----------- | ------- | -------- | ------ |
| lu-verifier | sonnet  | sonnet   | haiku  |
| lu-learner  | sonnet  | haiku    | haiku  |
| lu-planner  | opus    | opus     | sonnet |
| lu-executor | opus    | sonnet   | sonnet |

**Current model values:**

- Lightweight agents (lu-learner): `model="fast"`
- Reasoning-intensive agents (lu-verifier, lu-planner, lu-executor): omit model (inherit from parent)

````

Encode this as a template literal with proper escaping, following the same patterns as the existing file.

2. Ensure the Zod validation still passes. The file currently has:
   ```typescript
   const validatedConfig = skillConfigSchema.parse(luSkillConfig);
````

This validates at module initialization — if the config is malformed, it will throw. Verify by running:

```bash
bun -e "import './src/skills/luca/lu.skill.ts'"
```

3. Run the full plugin build:

   ```bash
   bun run build:plugin
   ```

4. Verify the compiled `skills/lu/SKILL.md` contains the new routing instructions:

   ```bash
   cat dist/plugin/skills/lu/SKILL.md
   ```

   Check that:
   - The routing table with Skill tool invocations is present
   - The delegation architecture section is present
   - No duplicate headings (the compiled output should have `# lu` once at the top)
   - Skill tool syntax (`Skill(skill: "...", args: "...")`) appears in the routing section
   - Task tool syntax (`Task(agent: "...", prompt: "...")`) appears for agents

5. Verify the command file for `/lu` was also regenerated correctly:

   ```bash
   cat dist/plugin/commands/lu.md
   ```

6. Run the full test suite:
   ```bash
   bun test
   ```

**Verification:**

- `lu.skill.ts` compiles without Zod validation errors
- Compiled SKILL.md contains Skill tool invocation syntax
- Compiled SKILL.md contains Task tool invocation syntax for agents
- All routing scenarios present in compiled output
- Build completes with 0 failures
- All tests pass

## Verification

- [ ] `/lu` skill acts as a router, not a monolithic orchestrator
- [ ] Main section clearly states routing role
- [ ] Workflow section contains explicit `Skill(skill: "...", args: "...")` invocations
- [ ] Agent delegation uses `Task(agent: "...", prompt: "...")` syntax
- [ ] All routing scenarios covered: new-project, new-milestone, trivial, moderate, complex, PR, debug, session-planning, progress
- [ ] Complexity override behavior preserved
- [ ] Model resolution table preserved
- [ ] Sub-agent delegation section streamlined (no duplication with workflow section)
- [ ] Zod schema validation passes at module initialization
- [ ] `bun run build:plugin` completes with 0 failures
- [ ] Compiled `skills/lu/SKILL.md` has correct content
- [ ] All tests pass: `bun test`
