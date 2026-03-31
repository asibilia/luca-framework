# Grounding Report

Verification of factual claims in the migration documentation against real code, documentation, and confirmed behavior.

**Overall confidence score: 78%** (23 of ~30 claims verified or internally consistent)

---

## Critical Issues (Resolved)

> All 3 critical issues identified in the original review have been corrected in the source documents. This section is retained for audit trail.

### G-ACC-001: MuninnDB API Signatures — RESOLVED

**Original issue:** `muninndb-context-pattern.md` used incorrect API signatures (`id` instead of `root_id`, string instead of array, wildcard forget).

**Resolution:** All API signatures corrected. `muninn_recall` now uses array syntax `["term1", "term2"]`. `muninn_recall_tree` documents ULID requirement. `muninn_forget` shows recall-then-iterate pattern. API notes section added.

### G-ACC-002: MCP SDK Dependency Claim — RESOLVED

**Original issue:** Architecture.md claimed `@modelcontextprotocol/sdk` was a transitive dependency of `claude-agent-sdk`.

**Resolution:** Architecture.md corrected to state "MCP SDK must be added" (not a transitive dependency). Note: the SDK IS installed in the project as a transitive dependency of `@google/genai`, but NOT via `claude-agent-sdk` as originally claimed.

### G-ACC-003: Sub-Skill Count — RESOLVED

**Original issue:** Architecture.md body said "23" but enumerated table totaled 22.

**Resolution:** All references in architecture.md corrected to "22". The correct count is 4+3+6+5+4 = 22 sub-skills.

---

## Verified Claims

| Claim                                                           | Source                                                                            | Confidence                  |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------- |
| Skill tool is prompt injection, not sub-process spawner         | `.planning/notes/skill-orchestration-investigation.md` lines 14-24                | HIGH                        |
| Agent tool spawns separate instance with own context            | `.planning/notes/skill-orchestration-investigation.md` lines 33-40                | HIGH                        |
| Sub-agents cannot spawn sub-agents                              | Investigation doc line 40 + hook-agent-compatibility-verification.md              | HIGH                        |
| Skills run in main conversation context                         | Investigation doc lines 14-24                                                     | HIGH                        |
| 5 orchestrators affected with listed sub-skills                 | Codebase grep of Skill() calls                                                    | HIGH                        |
| Max nesting depth of 4 levels                                   | Verified skill chain: lu -> lu-phase-loop -> phase-execute -> phase-execute-waves | HIGH                        |
| Enforcement hook factory line 173 checks `toolName !== "Skill"` | `src/hooks/__helpers/enforcement-hook-factory.ts` line 173                        | HIGH                        |
| Pre-step hooks match on `tool_filter: "Skill"`                  | `src/hooks/__helpers/hook-registry.ts`                                            | HIGH                        |
| `settings.json` uses `"matcher": "Skill"`                       | `.claude/settings.json`                                                           | HIGH                        |
| Vault routing for `session:*` to repo vault                     | `.claude/rules/vault-routing.md` Write Routing Heuristic                          | HIGH                        |
| All 5 internal research files exist                             | Filesystem glob                                                                   | HIGH                        |
| "push-wait-push lock" claim is FALSE                            | Acknowledged in architecture.md from verification team                            | HIGH                        |
| All "Files Affected" paths exist                                | Filesystem check                                                                  | HIGH (with count exception) |
| Recall depth limits from complexity matrix                      | `.claude/rules/complexity-gating.md`                                              | HIGH                        |

---

## Unverifiable Claims

| Claim                                              | Why Unverifiable                                                                                                          | Risk                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| "Task renamed to Agent in v2.1.63"                 | Version number appears nowhere else in codebase or research. Investigation doc says "formerly Task tool" without version. | LOW — version number may be correct but could be hallucinated |
| "MuninnDB writes are immediate, not transactional" | No source cited. Claim about MuninnDB internal behavior.                                                                  | LOW — plausible but should be flagged as assumption           |
| "Channels launched March 20, 2026"                 | Internal research only; cannot verify against external source                                                             | LOW — internally consistent across research docs              |
| "Pro/Max users bypass the allowlist"               | Quoted from official docs in verification report; cannot re-verify                                                        | LOW — cited with source                                       |
| GitHub issue existence (#17351, #29191, etc.)      | URL format correct but issues not fetched to confirm                                                                      | MEDIUM — format is valid for anthropics/claude-code           |
| MASFT "NeurIPS 2025" attribution                   | arxiv 2503 prefix is March 2025; timeline plausible but unconfirmed                                                       | LOW                                                           |
| AgentSpec ICSE 2026                                | Conference attribution cannot be verified                                                                                 | LOW                                                           |

---

## Internal Contradictions

1. **Sub-skill count**: Architecture.md body says "23" but enumerated table totals 22. Internal inconsistency.

2. **Bug report numbering across documents**: Architecture.md cites `#36975`. Verification report does not list it in duplicates — lists `#37933` and `#36472` instead. `02-implementation-approaches.md` does reference `#36975`. Cross-document inconsistency in which issues are cited.

3. **MuninnDB API representation**: muninndb-context-pattern.md uses pseudocode-style calls that do not match actual MuninnDB MCP tool signatures. Document describes an idealized API.

---

## Recall Depth Interpretation Gap

The muninndb-context-pattern.md adds behavioral interpretations beyond the complexity rule:

| Complexity | Rule says      | MuninnDB doc adds                    |
| ---------- | -------------- | ------------------------------------ |
| TRIVIAL    | recallDepth: 1 | "Project identity only"              |
| SIMPLE     | recallDepth: 1 | "Project identity + session context" |
| MODERATE   | recallDepth: 3 | "All three recall operations"        |

The behavioral descriptions are the doc's own interpretation, not grounded in the source rule. The actual behavior depends on lu-cognition's implementation.

---

## Version Currency

| Library                          | Documented                   | Actual            | Notes       |
| -------------------------------- | ---------------------------- | ----------------- | ----------- |
| `@anthropic-ai/claude-agent-sdk` | Not specified                | 0.2.81            | Current     |
| `@modelcontextprotocol/sdk`      | v1.27.1 (claimed transitive) | **Not installed** | Claim false |
| XState                           | Not specified                | ^5.28.0           | Current     |

---

## Recommendations

1. **Fix MuninnDB API signatures** in muninndb-context-pattern.md before any implementation work
2. **Correct sub-skill count** to 22 or identify the missing 23rd sub-skill
3. **Remove MCP SDK dependency claim** from Option F section
4. **Add citation or "assumption" flag** for MuninnDB transactional behavior claim
5. **Standardize bug report references** across research documents
6. **Verify recall depth behavioral mapping** against lu-cognition implementation

---

## Sources

- `docs/skill-to-agent-migration/architecture.md` — Primary migration doc
- `docs/skill-to-agent-migration/muninndb-context-pattern.md` — MuninnDB protocol
- `.planning/notes/skill-orchestration-investigation.md` — Original investigation
- `.planning/research/hook-agent-compatibility-verification.md` — Hook verification
- `.planning/research/04-pitfalls-and-risks.md` — Option B risk assessment
- `.planning/research/option-f-verification-report.md` — Option F verification
- `src/hooks/__helpers/enforcement-hook-factory.ts` — Hook factory code
- `src/hooks/__helpers/hook-registry.ts` — Hook registration
- `.claude/settings.json` — Generated settings
- `node_modules/@anthropic-ai/claude-agent-sdk/package.json` — SDK dependencies
