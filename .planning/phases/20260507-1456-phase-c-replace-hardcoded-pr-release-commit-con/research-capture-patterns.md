# Research Capture — Implementation Patterns

**Subagent**: researcher
**Perspective**: patterns
**Timestamp**: 2026-05-07T18:56Z

## Findings (verbatim)

# Implementation Patterns Research Report — Phase C

## 1. Phase B's Consult-Pattern Template (verbatim)

### 1a. Four-Step Flow (architect.md:48-93)

Originating-incident comment (architect.md:32-36):
```
<!-- Originating incident: PT-12458. The previous flow hardcoded a fixed branch-type enum
     and coupled `status` → skip-create, which silently allowed commits to land on a
     release branch when `status` returned `on-feature` for any non-default branch.
     The new flow is consult → resolve → (confirm if required) → apply, with G-DX-003
     carve-out forcing `ask_user` even in `full-auto` when base confirmation is requested. -->
```

Step 1 — Consult (pure read):
```
ensureFeatureBranch({ action: "consult" })
```

Step 2 — Resolve (pure):
```
ensureFeatureBranch({
  action: "resolve",
  ticketId: "<ticket id from intent>",
  intent: "<short slug source>",
  type: "<conventional-commit type>"
})
```

Step 3 — Confirm if needed (G-DX-003 carve-out):
```
ask_user({
  question: "Confirm base branch for new branch '<branchName>'? Resolved: base=<base>, prBase=<prBase>",
  options: [...]
})
```

Step 4 — Apply (mutating):
```
ensureFeatureBranch({
  action: "apply",
  resolution: <resolve result>,
  confirmedBase: "<resolved or user-provided base>",
  issueNumber: <number?>
})
```

### 1b. Triage Sentinel (triage.md:75-88)

```
result = projectPreferences(action: "consult", fallback: false)
```
- `result.preferences === null` → invoke `/luca-init` skill, then continue
- otherwise → continue
- "Downstream phases call `consult(fallback: true)` and never trigger init"

### 1c. assert-not-default (execute.md:374-382)

```
ensureFeatureBranch({ action: "assert-not-default" })
```

### 1d. finalize.md base resolution (lines 342-345)

```
workflowState({ action: "read" })  // → state.prBase, state.baseBranch
const base = state.prBase ?? state.baseBranch ?? 'main'
```
Comment: "Do NOT call `ensureFeatureBranch({ action: 'consult' })` here; consult is not in finalize's tool-manifest scope (`['status', 'assert-not-default']`) and will be rejected at runtime."

`projectPreferences` IS in finalize scope (`['consult','consult-section']`) — Phase C calls there are safe.

## 2. consult-section Contract (verified)

| Condition | fallback | Returns |
|---|---|---|
| File present | any | `{success:true, section:<obj>}` |
| File missing, seeded | any | `{success:true, section:<DEFAULTS>}` |
| File missing, not seeded | true | `{success:true, section:<DEFAULTS>}` |
| File missing, not seeded | false/omitted | `{success:true, section:null}` |
| Unknown section | any | `{success:false, message:"..."}` |

NEVER throws. Phase C must guard `if (result.section === null)` or pass `fallback:true`.

Template for non-triage:
```
projectPreferences({ action: "consult-section", section: "pr", fallback: true })
```

## 3. Skill / Rule / Command Conventions

### 3a. SKILL.md frontmatter
```yaml
---
name: <kebab-case>
description: >
  <folded-scalar multi-line>
---
```

### 3b. Skill body
- `## Phase N — Title` or `### Step N — Title`
- Tool calls in **fenced code blocks** without lang tag
- Failure modes / Flags tables at end

### 3c. Rules
```yaml
---
description: "<inline double-quoted>"
alwaysApply: true
---
```
Rules show explicit `mcp__muninn__muninn_recall(...)` calls with full prefix (run outside pipeline).

### 3d. Commands
```yaml
---
name: <kebab>
description: <unquoted single-line>
---
```
- `## Parse Arguments` then `## Steps` with `### Step N`
- Bare tool calls, NO `mcp__muninn__` prefix unless explicitly needed

## 6. Canonical MuninnDB Memory `01KR1BMR4M1M6MR496C80KC6WS`

```json
{
  "version": 1,
  "project": "luca-framework",
  "branching": {...},
  "commits": {
    "convention": "conventional-commits",  // schema rejects, allows only "conventional"|"none"
    "types": ["feat","fix","refactor","chore","docs","test","style"],
    "scopes": ["framework","mastracode","studio","config","docs","repo"],
    "subjectMaxLength": 72,
    "trailers": { "coAuthor": true, "issueRef": "Closes #" }
  },
  "pr": {
    "titleTemplate": "{type}({scope}): {version} #{issue} {description}",  // schema field is titleFormat
    "titleExamples": [...],
    "forbidden": [{"pattern":"\\(#\\d+\\)","reason":"Never use (#issue) as scope"}],
    "bodyTemplate": "what-why-how-testplan",
    "draftByDefault": true,
    "scopeFromPackagePath": true
  },
  "release": {
    "tool": "changesets",
    "changesetDir": ".changeset",
    "bumpMapping": {"feat":"minor","fix":"patch",...},  // schema field is versionBump
    "frontmatterFormat": "yaml-package-bump",
    "versioning": "semver"
  },
  "tracker": {
    "kind": "github-issues",  // schema rejects, allows "github"
    "ticketPattern": null,
    "issueRequired": false,
    "linkFormat": "Closes #{issue}"
  }
}
```

## 7. Inventory: luca-framework-specific tokens to remove

### 7a. Scope enum `framework|mastracode|studio|config|docs|repo`
| File | Line | Content |
|---|---|---|
| `rules/pr-title-format.md` | 15 | `Scopes: framework\|mastracode\|studio\|config\|docs\|repo.` |
| `rules/pr-title-format.md` | 16 | `Example: feat(mastracode): v10.2.0 #143 ...` |

### 7b. Bump map prose
| File | Line | Content |
|---|---|---|
| `skills/gh-prepare/SKILL.md` | 100 | `feat → minor, fix/chore/refactor → patch` |

### 7c. PR title template
| File | Line | Content |
|---|---|---|
| `rules/pr-title-format.md` | 14 | `type(scope): <version> #issue description` |
| `finalize.md` | 298 | `type(scope): vX.Y.Z #issue description` |
| `finalize.md` | 347 | `Per recalled convention — type(scope): vX.Y.Z ...` |

### 7d. `Closes #` references
| File | Line |
|---|---|
| `finalize.md` | 349 |
| `gh-prepare/SKILL.md` | 130, 144, 174, 196 |
| `gh-issue-triage/SKILL.md` | 15, 103 |

### 7e. PR body template `what-why-how-testplan`
| File | Lines |
|---|---|
| `gh-prepare/SKILL.md` | 141-160 (full hardcoded template) |

### 7f. Conventional commit type enum
| File | Line | Content |
|---|---|---|
| `execute.md` | 409 | `Types: feat, fix, refactor, test, docs, chore` |

### 7g. `Refs: #` trailer in execute.md:407 — may be intentional differentiation from PR `Closes #`

## 8. Anti-patterns

- **AP-1**: Using `fallback:false` in non-triage. Sentinel is triage-only.
- **AP-2**: Don't call `ensureFeatureBranch.consult` in finalize (not in scope). `projectPreferences.consult-section` IS allowed.
- **AP-3**: `consult-section` returns `{success:true, section:null}` when unseeded+`fallback:false`. Always null-guard or use `fallback:true`.
- **AP-4**: Don't rebuild calls via string interpolation (SAFE_FREEFORM rejects quotes/backticks).
- **AP-5**: Don't hardcode `package.json` lookups for version — use `pr.titleFormat` template.
- **AP-6**: Zero `TODO: configurable` markers found — Phase C must rely on inventory.

## Open Questions

1. Schema mismatch `convention: "conventional-commits"` vs `"conventional"|"none"` — update enum or rename memory?
2. `Refs: #` (commits) vs `Closes #` (PRs) — intentional?
3. `bodyTemplate: "what-why-how-testplan"` is a key, not template — does Phase C define heading mappings in schema?
4. `gh-issue-triage/SKILL.md` Closes # prose — Phase C target or intentional?
5. `executor.ts` subagent commit format — also needs consult?
