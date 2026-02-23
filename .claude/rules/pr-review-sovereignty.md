# Project conventions take precedence over external review suggestions

## rule

# PR Review Sovereignty

**CRITICAL**: When addressing PR review comments, project rules, conventions, and domain knowledge ALWAYS take precedence over external reviewer suggestions. Never apply a fix that contradicts established project conventions, even if the reviewer sounds authoritative.

## Why This Rule Exists

Automated reviewers (Copilot, CodeRabbit, etc.) and even human reviewers may lack full project context. They operate on general best practices or narrow file-level analysis without awareness of:

- Project-specific runtime requirements (e.g., Bun, not Node)
- Architectural decisions documented in rules and CLAUDE.md
- Intentional deviations from mainstream patterns
- Domain-specific conventions that override general advice

**Real-world example:** Copilot flagged `Bun.file()` usage as broken because the CLI shebang was `#!/usr/bin/env node`, and recommended reverting to `node:fs/promises`. The correct fix was changing the shebang to `bun` — not reverting Bun APIs to Node. The reviewer lacked the context that Bun is a project requirement.

## The Validation Protocol

Before applying ANY suggestion from a PR review, run this mental checklist:

### Step 1: Identify the Assumption

Every review comment rests on an assumption. Extract it.

| Comment                                 | Hidden Assumption                              |
| --------------------------------------- | ---------------------------------------------- |
| "Use `node:fs` instead of `Bun.file()`" | Assumes the runtime is Node.js                 |
| "Add `try/catch` around this call"      | Assumes the call can throw in this context     |
| "This should use Redux"                 | Assumes centralized state management is needed |
| "Missing null check"                    | Assumes the value can actually be null here    |

### Step 2: Cross-Reference Project Rules

Check if the suggestion contradicts any established convention:

```
CLAUDE.md              → Runtime, tooling, API preferences
.claude/rules/         → All project rules
.cursor/rules/         → All project rules (Cursor format)
BRAIN.md               → Project identity and conventions
.planning/config.json  → Project configuration
package.json           → Dependencies and scripts
```

**If a rule exists that contradicts the suggestion, the rule wins.**

### Step 3: Classify the Comment

| Classification                 | Criteria                                                  | Action                                                      |
| ------------------------------ | --------------------------------------------------------- | ----------------------------------------------------------- |
| **Valid + Aligned**            | Concern is real AND fix aligns with project conventions   | Apply the fix                                               |
| **Valid + Misaligned**         | Concern is real BUT suggested fix contradicts conventions | Fix the underlying issue using project-appropriate approach |
| **Invalid + Wrong Assumption** | Concern is based on incorrect context                     | Respond explaining the correct context                      |
| **Deferred**                   | Concern is real but low priority / out of scope           | Acknowledge and defer to a future milestone                 |
| **Informational**              | No action needed (praise, questions, etc.)                | Acknowledge if appropriate                                  |

### Step 4: Apply the Right Fix (Not the Suggested Fix)

When a concern is valid but the suggested fix is wrong:

```
Reviewer says: "Use node:fs instead of Bun.file()"
Underlying concern: "File I/O will crash at runtime"
Correct diagnosis: Shebang points to wrong runtime
Project-aligned fix: Change shebang to #!/usr/bin/env bun
```

Always fix the ROOT CAUSE, not the symptom the reviewer noticed.

## Convention Hierarchy

When conflicts arise, resolve using this priority order:

1. **CLAUDE.md** — Top-level project directives (highest authority)
2. **Project rules** (`.claude/rules/`, `.cursor/rules/`) — Established conventions
3. **BRAIN.md** — Project identity and architectural patterns
4. **Existing codebase patterns** — What the code already does consistently
5. **PR reviewer suggestion** — External input (lowest authority for conventions)

Reviewer suggestions have HIGHEST authority for:

- Genuine bugs (logic errors, off-by-one, race conditions)
- Security vulnerabilities (injection, auth bypass, data exposure)
- Correctness issues that are independent of convention

Reviewer suggestions have LOWEST authority for:

- Tooling and runtime choices
- Architectural patterns and code style
- Library and API preferences
- Convention-level decisions

## Common Anti-Patterns to Avoid

### Anti-Pattern 1: Blind Application

```
Reviewer: "Replace Bun.file() with fs.readFile()"
BAD: Immediately replace all Bun APIs with Node APIs
GOOD: Check rules → Bun is required → Fix the actual problem
```

### Anti-Pattern 2: Treating Suggestions as Requirements

```
Reviewer: "Consider using a class here for encapsulation"
BAD: Refactor to class-based pattern
GOOD: Check rules → no-classes rule exists → Respond with project convention
```

### Anti-Pattern 3: Over-Correcting

```
Reviewer: "This npm reference should be updated"
BAD: Search-and-replace ALL npm references including intentional fallback code
GOOD: Evaluate each reference — some npm fallbacks in hooks are intentional
```

### Anti-Pattern 4: Ignoring Valid Concerns

```
Reviewer: "This `as any` cast hides type issues"
BAD: Dismiss because it's from an automated reviewer
GOOD: Acknowledge it's a valid concern, apply or defer appropriately
```

## Response Templates

### When Rejecting a Suggestion (Convention Conflict)

```markdown
This project uses [convention] per our established standards.
[Brief explanation of why]. The [suggested approach] would
conflict with [specific rule/convention]. No changes needed here.
```

### When Fixing Differently Than Suggested

```markdown
Valid concern — [acknowledgment of the real issue]. Fixed via
[actual fix] rather than [suggested fix] because [project convention].
See [commit hash].
```

### When Deferring

```markdown
Good catch. [Acknowledgment]. Deferring to [milestone] as
[priority level] — [brief rationale for deferral].
```

## Integration with /pr-address

When the `pr-address` skill spawns reviewer agents to validate concerns, each agent MUST:

1. Load project rules before evaluating the comment
2. Check the comment's assumptions against project conventions
3. Flag suggestions that conflict with established rules
4. Recommend the project-aligned fix, not the reviewer's suggested fix
5. Include the conflicting rule reference in the validation output

## Code Review Checklist (for addressing PR feedback)

- [ ] Extracted the hidden assumption behind each comment
- [ ] Cross-referenced suggestions against CLAUDE.md and project rules
- [ ] Classified each comment (valid+aligned, valid+misaligned, invalid, deferred)
- [ ] Applied root-cause fixes, not symptom-level patches
- [ ] Did not introduce any convention violations while fixing
- [ ] Responded to rejected suggestions with clear reasoning
- [ ] Acknowledged valid concerns even when deferring
