# Review Capture — Security [Wave 1]

**Subagent**: reviewer
**Perspective**: security
**Timestamp**: 2026-05-07T16:00:00Z

## Findings

**MUST-FIX**:

SEC-1: `apply` action accepts `resolution.branchName`, `confirmedBase`, `confirmedPrBase` as bare `z.string()` with no character restriction. All flow directly into `execFileSync` args (`git switch finalBase`, `git switch -c target`). While execFileSync array-form prevents shell injection, branch ref names like `-c`, `..`, `@{`, or names with `\0` can abuse git's own parsing. An LLM-controlled resolve→apply cycle could supply `resolution.branchName="-C main"` causing git to execute unintended operations.
  - File: ensure-feature-branch.ts:440-444, 685, 740, 752
  - Fix: Add SAFE_REF_NAME validator (`z.string().max(128).regex(/^[a-zA-Z0-9._\-\/]+$/)`) applied to resolution.branchName, resolution.base, confirmedBase, confirmedPrBase. Add leading-dash guard.

SEC-2: `RegexSource` provides no ReDoS protection. `.max(128)` cap prevents disk consumption but not catastrophic backtracking. A malicious preferences.json author can write `match: "(a+)+"` (6 chars). resolveBranching iterates branchTypes[] in a loop; crafted ticketId against polynomial-backtracking pattern blocks Node event loop indefinitely.
  - File: project-preferences.ts:40-43
  - Fix: Add nested-quantifier check (e.g., `/(\+|\*|\{[0-9,]+\}){2,}/` on the source) as a second `.refine()`. At minimum add JSDoc warning + simple heuristic.

**SHOULD-FIX**:

SEC-3: `ticketId` (bare z.string() optional, no length cap) passes unsanitized as `{issue}` into renderTemplate; output becomes git branch name. Even with array-form safety, ticketId with path separators, spaces, null bytes produce invalid git ref names.
  - File: ensure-feature-branch.ts:326, 333-335, 424-429
  - Fix: Add `.max(64).regex(/^[A-Za-z0-9_\-./]+$/)` to ticketId schema.

SEC-4: Idempotent already-on-target path collision check produces misleading error when `force=true && current===target` (says "Local branch already exists" instead of treating as success). Minor.

SEC-5: `intent` field has no length cap. `slugifySegment` truncates but unsanitized `intent` is echoed into `notes[]` returned in resolve response.
  - Fix: Add `.max(256)` to intent.

**Confirmed clean**:
- Tool-manifest scoping correct (execute/finalize → ['status','assert-not-default'])
- All preference fields flowing to muninnInstruction go through SAFE_FREEFORM
- branch-template regex `/\{([^}]+)\}/g` handles `{type/issue}` correctly (slash inside braces becomes unknown key → throws)
- git-first / state-second invariant preserved in apply path

## Verdict

REQUEST_CHANGES — 2 MUST-FIX, 3 SHOULD-FIX
