# Research Capture — Dependencies

**Subagent**: researcher (dependencies)
**Timestamp**: 2026-05-07T15:05:00Z

## Findings

### Phase A delivery available

- projectPreferences tool: consult/consult-section/seed/update working
- BranchingSection: types[], template, defaultBranch, guardedBranches[]

### Phase B schema gap

Additive in BranchingSection (NO schemaVersion bump):
- branchTypes: z.array(BranchTypeRule).optional()
- fallback: BranchTypeRule.optional()
- confirmBaseBeforeCreate: z.boolean().default(false)

BranchTypeRule:
- match: RegexSource
- template: SAFE_FREEFORM
- base: BaseRule
- prBase: BaseRule
- role?: 'feature'|'release'|'rc'

BaseRule:
- kind: z.enum(['static','current-branch-if-matches','ask'])
- value?: SAFE_FREEFORM
- pattern?: RegexSource
- fallback?: SAFE_FREEFORM | 'ask'

### Git CLI commands

Existing tool already covers all needed: branch --show-current, symbolic-ref, switch, switch -c, branch -m, ls-remote. NO new git commands for Phase B.

### Cross-tool integration

| Tool | Current | Phase B |
|------|---------|---------|
| finalize.md gh pr create --base | hardcoded main | read state.prBase ?? state.baseBranch ?? defaultBranch |
| gh-prepare/SKILL.md | raw git | OUT OF SCOPE Phase B |
| .changeset/config.json | main | LEAVE ALONE |

### Test fixtures

Two scenarios:
- (a) luca-framework single-rule fallback (current behavior)
- (b) ENG/PT multi-rule. Inline preferences in test file.

### Breaking change blast radius

ensureFeatureBranch action enum:
- ADD: assert-not-default, consult, resolve, apply
- KEEP: status, create, rename (back-compat)

Caller updates: tool-manifest.ts (mode permissions), executor.ts:20 (status→assert-not-default), finalize.md:339 (status→assert-not-default), architect.md:32-61 (rewrite Step 1).
