# Research Capture — Implementation Patterns

**Subagent**: researcher (patterns)
**Timestamp**: 2026-05-07T15:05:00Z

## Findings

### 1. Template rendering — GAP

Template stored in preferences (project-preferences.ts:41) but never rendered. ensure-feature-branch.ts:132-145 buildBranchName uses string concat. slugifySegment phase-paths.ts:47-53 (48-char) vs ensure-feature-branch slugify (60-char fallback "work"). DIVERGENT.

**Phase B needs**: renderTemplate(template, vars). Standardize slugify.

### 2. Regex match (Zod) — GAP

parseTicketId phase-paths.ts:67 uses /\b([A-Z]{2,}-\d+)\b/. SAFE_FREEFORM blocks regex metacharacters [, ], +, *, ^, $, |.

**Phase B needs** RegexSource refinement:
```ts
const RegexSource = z.string().min(1).max(128).refine(
  v => { try { new RegExp(v); return true } catch { return false }},
  { message: 'must be valid regex source' }
)
```

### 3. Base resolution

defaultBranch() ensure-feature-branch.ts:70-83 already exists. Not exported. git() wrapper lines 23-54 also private.

**Phase B options**: (a) export defaultBranch, OR (b) move to util/git.ts.

### 4. ask_user pattern — established

architect.md:367-373 (plan approval), luca-init SKILL.md:63-71 (preferences confirm). Full-auto bypass: `if state.oversight === "full-auto"` skip ask_user.

**Phase B**: architect.md adds branch-base confirmation. SEE RISK-3 carve-out.

### 5. Test fixtures

3 patterns: (A) spyOn lucaStore, (B) tmpdir+chdir, (C) source-level string assertions.

ensure-feature-branch.test.ts: 12 tests, 186 lines. NO behavioral git tests.

**Phase B test strategy**: extract resolver as pure function → Pattern A (spyOn). New categories: regex dispatch, base kinds, template, fallback, multi-rule ordering, needsConfirmation.

### 6. Error shape

projectPreferences: {success:false, message}. ensureFeatureBranch: {ok, status, message, currentBranch?, defaultBranch?, proposedBranch?}.

**Phase B**: use {ok, status, message} for new actions. Add status codes: "policy-blocked", "needs-confirmation", "guarded-branch-detected".
