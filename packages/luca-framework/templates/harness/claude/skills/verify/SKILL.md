# verify

Validate built features through UAT testing and code review via Agent() sub-agents.

## main

<main>
# <%= branding.frameworkName %> Verify — Flat Agent() Orchestrator

Validate built features through UAT testing and code review.

**Arguments:** `[phase_number] [--gaps-only]`

## Constraints

- **Agent() calls originate from this orchestrator** — sub-agents are leaf workers
- **Sub-agents CANNOT call Agent(), Task(), or Skill()**
- **verify-test is INLINE** — it requires interactive user input, so it runs directly in this conversation, NOT as an Agent()
- **Prompt templates** in `src/skills/__helpers/agent-prompts.ts` — read that file for full Agent() prompt content

## State Machine

```
idle -> extracted -> tested
  Path A (no issues): tested -> reviewed (terminal)
  Path B (issues):    tested -> diagnosed (terminal)
```

**Write `current_state` after EVERY transition:**
```bash
bun src/skills/__schemas/context-cli.ts write verify '{"current_state":"extracted"}'
```

## Process

```bash
luca-bridge write-status --skill=verify --stage=VERIFYING 2>/dev/null || true
```

### Step 0: Parse Args, Crash Recovery, Initialize Context

Parse phase number and flags.

**Crash recovery:**
```bash
EXISTING_STATE=$(bun src/skills/__schemas/context-cli.ts state verify 2>/dev/null || echo "")
if [ -n "$EXISTING_STATE" ] && [ "$EXISTING_STATE" != "idle" ]; then
  echo "Resuming from state: $EXISTING_STATE"
else
  bun src/skills/__schemas/context-cli.ts init verify
fi
```

### Step 1: Extract Deliverables (idle -> extracted)

Read `src/skills/__helpers/agent-prompts.ts` for the VERIFY_EXTRACT_PROMPT template, then:

```
Agent(name: "extract", description: "Extract UAT deliverables",
  prompt: VERIFY_EXTRACT_PROMPT with phase={phase_number}, vault=REPO_VAULT)
```

Parse Agent output for STATUS. On failure: write state "failed", HALT.

**Write state:**
```bash
bun src/skills/__schemas/context-cli.ts write verify '{"current_state":"extracted"}'
```

### Step 2: Interactive Testing (extracted -> tested) — INLINE

**This step runs INLINE in the main conversation. Do NOT delegate to Agent().**

Present UAT tests to the user one at a time from the UAT.md created in Step 1:

1. Read the UAT.md file (path from extract agent's output)
2. Parse test items
3. Present each test one at a time to the user
4. Collect responses: yes/pass/next = PASS, anything else = ISSUE
5. Update UAT.md with results after each batch
6. Finalize UAT.md with summary
7. Set `issues_found = true` if any test failed

**Write state:**
```bash
bun src/skills/__schemas/context-cli.ts write verify '{"current_state":"tested"}'
```

### Step 3: Path Decision (tested -> diagnosed OR reviewed)

Check the test results from Step 2:

#### Path B: Issues Found (tested -> diagnosed)

```
Agent(name: "diagnose", description: "Diagnose UAT failures",
  prompt: VERIFY_DIAGNOSE_PROMPT with failed test details)
```

The diagnose agent does ALL debugging work as a leaf agent (reads code, identifies root causes, proposes fixes). It does NOT spawn sub-agents.

On failure: write state "failed", HALT.

**Write state:**
```bash
bun src/skills/__schemas/context-cli.ts write verify '{"current_state":"diagnosed"}'
```

**diagnosed is terminal.** Report to user, suggest `/phase-execute --gaps-only`.

#### Path A: No Issues (tested -> reviewed)

```
Agent(name: "review", description: "Code quality review",
  prompt: VERIFY_REVIEW_PROMPT with phase context)
```

The review agent checks changed files for architecture, security, DX, and performance concerns. It does ALL review work as a leaf agent.

On failure: write state "failed", HALT.

**Write state:**
```bash
bun src/skills/__schemas/context-cli.ts write verify '{"current_state":"reviewed"}'
```

**reviewed is terminal.** Report to user, suggest next phase.

### Step 4: Report Summary

**If diagnosed (Path B):**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 <%= branding.frameworkName %> > PHASE {N} ISSUES FOUND
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{passed}/{total} tests passed, {failed} issues diagnosed
Next: /phase-execute {N} --gaps-only
```

**If reviewed (Path A):**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 <%= branding.frameworkName %> > PHASE {N} VERIFIED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{N}/{N} UAT tests passed, code review completed
Next: /phase-discuss {N+1} or /milestone-audit
```

### Step 5: Gap Detection Audit

Verify execution coverage:
- `verify_extract`: required
- verify-test (inline): required
- Path A: `verify_review`: required
- Path B: `verify_diagnose`: required

If any required step missing: log warning (advisory).

## Error Handling

On any agent failure: write state "failed", report to user.

## Success Criteria

- [ ] UAT.md created with tests from SUMMARY.md
- [ ] Tests presented one at a time (INLINE, interactive)
- [ ] If issues: diagnose agent identifies root causes and proposes fixes
- [ ] If clean: review agent checks code quality
- [ ] current_state written after every transition
- [ ] Gap detection audit passes

```bash
luca-bridge clear-status 2>/dev/null || true
```
</main>