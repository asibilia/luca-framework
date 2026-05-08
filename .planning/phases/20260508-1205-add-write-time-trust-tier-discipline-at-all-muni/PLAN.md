# Plan: Memory Tier-Promotion Contract

## Objective

Establish write-time trust-tier discipline at every `muninn_remember`/`_batch` callsite in luca-mastracode prose. Tier-decision rule lives in a single source-of-truth constant injected into BOTH the MODE prefix (`agent-constraints.ts`) AND the SUBAGENT prefix (`subagents/shared-prefix.ts`). Verified-tier writes get an explicit `muninn_trust` follow-up call. Prose-snapshot tests guard the contract.

## Context

- 17 `muninn_remember`/`_batch` callsites across 16 files. Note: `research-capture-scope.md` opening sentence says "14 writes" but tabulates W1–W17. **17 is correct.**
- 5 verified-tier candidates (cite user intent): W1 milestone init, W3 user-keep, W6/W7 arch-audit accept/reject, W8 luca-init prefs. Rest stay `inferred`.
- MODE and SUBAGENT injection paths are mutually exclusive — both must be updated.
- Two prose forms exist: (a) **fenced block** with `###` heading or bold sentence above; (b) **inline call** in a bullet/numbered list item with no fenced block. W3 and W12 are inline; rest are fenced.
- See RESEARCH.md, CONTEXT.md, research-capture-{scope,architecture,patterns,dependencies,risk}.md, plan-review-capture-1.md.

## Marker Placement Conventions

**Fenced-block callsites** — HTML comment immediately preceding the fenced block:
```markdown
### Store Decisions in MuninnDB

<!-- Tier: inferred -->
```
mcp__muninn__muninn_remember_batch(...)
```
```

**Inline-call callsites** — HTML comment on the preceding line, no fence:
```markdown
- **Keep**: <!-- Tier: verified -->
  Call `mcp__muninn__muninn_remember(vault: <repo_vault>, concept: "shadow-debt:kept:<file>", ...)`
  Then promote: `mcp__muninn__muninn_trust(id: <returned-id>, trust: "verified", vault: <repo_vault>)`
```

**Subagent `.ts` backtick strings** — JS-style comment line above the escaped fence:
```ts
// Tier: inferred
\`\`\`
mcp__muninn__muninn_remember(...)
\`\`\`
```

**Tool description strings** — `# Tier: ...` line in the description string above the snippet.

## Phases

### Phase 1: Memory Tier-Promotion Contract

#### Wave 1: Tracer bullet — single SoT + dual injection + one verified callsite end-to-end

- [ ] **Task 1.1.1**: Create `packages/luca-mastracode/src/memory-tier-discipline.ts` exporting `MEMORY_TIER_DISCIPLINE: string`. Section header `## Memory Tier Discipline`. Body: 4-tier decision rule (verified/inferred/external/untrusted), 2-RPC pattern note (`muninn_remember` returns id → call `muninn_trust(id, tier)` for verified writes), batch handling note (all batch writes blanket `inferred`).
  - Files: `packages/luca-mastracode/src/memory-tier-discipline.ts` (new)
  - Verification: `bun test memory-tier-prefix` (after Task 1.1.5) checks `MEMORY_TIER_DISCIPLINE.length < 800` chars (token budget proxy) and contains all 4 tier names + "muninn_trust" + "inferred".

- [ ] **Task 1.1.2**: Inject into MODE prefix. Append `MEMORY_TIER_DISCIPLINE` to `getAgentConstraints()` between `loadAlwaysApplyRules()` output and `RECENCY_REMINDERS`. Import from `./memory-tier-discipline.js`.
  - Files: `packages/luca-mastracode/src/agent-constraints.ts`
  - Verification: `grep -c 'MEMORY_TIER_DISCIPLINE' src/agent-constraints.ts == 2` (1 import + 1 use).

- [ ] **Task 1.1.3**: Inject into SUBAGENT prefix. Convert `SUBAGENT_SHARED_PREFIX` from string-literal to template-literal that interpolates `MEMORY_TIER_DISCIPLINE` immediately before `## Luca Reminders`.
  - Files: `packages/luca-mastracode/src/subagents/shared-prefix.ts`
  - Verification: `grep -c 'MEMORY_TIER_DISCIPLINE' src/subagents/shared-prefix.ts == 2`.

- [ ] **Task 1.1.4**: Update one verified callsite end-to-end as tracer: W1 `commands/milestone-new.md:168`. Add `<!-- Tier: verified -->` HTML comment immediately above the fenced `muninn_remember` block. Below the block, add a brief intro sentence and a follow-up fenced block with `mcp__muninn__muninn_trust(id: <returned-id>, trust: "verified", vault: <repo_vault>)`.
  - Files: `packages/luca-mastracode/commands/milestone-new.md`
  - Verification: `grep -c 'Tier: verified' commands/milestone-new.md >= 1` AND `grep -c 'muninn_trust' commands/milestone-new.md >= 1`.

- [ ] **Task 1.1.5**: Add prefix-content test (Pattern 2). New `src/__tests__/memory-tier-prefix.test.ts` reads source files via `import.meta.url`, asserts: (a) `memory-tier-discipline.ts` source contains "Memory Tier Discipline" + 4 tier names + "muninn_trust"; (b) `agent-constraints.ts` and `subagents/shared-prefix.ts` import the constant; (c) byte-length of constant < 800 chars.
  - Files: `packages/luca-mastracode/src/__tests__/memory-tier-prefix.test.ts` (new)
  - Verification: `bun test memory-tier-prefix` exits 0.

#### Wave 2: Annotate ALL callsites (inferred + verified) — single sweep

To avoid the interim-state hazard from G-ARCH-002 (verified callsites unmarked at end of Wave 2 in prior plan), Wave 2 annotates EVERY callsite in one pass. Callsite-scan test added in Wave 3 then validates the entire surface at once.

- [ ] **Task 1.2.1**: Annotate inferred fenced-block callsites in mode-instruction `.md` files.
  - W9 `architect.md:127`, W10 `research.md:196`, W11 `finalize.md:87`, W14 `review.md:128`, W15 `execute.md:320`
  - Add `<!-- Tier: inferred -->` HTML comment immediately above each fenced `muninn_remember` block.
  - Verification (per-callsite): for each file, `grep -B1 'mcp__muninn__muninn_remember' <file> | grep -c 'Tier:' >= <expected>` where expected = number of callsites in that file (architect=1, research=1, review=1, execute=1, finalize=1 for line 87). Run as a single shell pipe per file.

- [ ] **Task 1.2.2**: Annotate inferred inline-call callsites (no fenced block).
  - W12 `finalize.md:128` (inline in numbered list item 6)
  - W13 `finalize.md:231` (vault hardcoded "default" — only annotate; vault fix is separate todo)
  - Add `<!-- Tier: inferred -->` HTML comment on the preceding line. Bullet/list-item content unchanged.
  - Verification: `grep -B1 'shadow-debt-scan' src/instructions/finalize.md | grep -c 'Tier:'` >= 1; same for line 231 area.

- [ ] **Task 1.2.3**: Annotate inferred subagent `.ts` callsites. Add `// Tier: inferred` JS comment line in the backtick-string instruction body immediately above each escaped fence.
  - W16 `subagents/shadow-scanner.ts:231`, W17 `subagents/learner.ts:43`
  - Verification: `grep -c '// Tier: inferred' src/subagents/shadow-scanner.ts >= 1` and same for learner.ts.

- [ ] **Task 1.2.4**: Annotate inferred command/skill callsites.
  - W2 `commands/gh-pr-address.md:198` (fenced), W4 `commands/repo-cleanup.md:44` (fenced), W5 `skills/gh-prepare/SKILL.md:183` (fenced)
  - Add `<!-- Tier: inferred -->` above each fence.
  - Verification: `grep -c 'Tier: inferred' <file>` >= 1 each.

- [ ] **Task 1.2.5**: Annotate inferred tool description strings.
  - `src/tools/run-postmortem.ts:15,35` (description string contains the muninn_remember snippet), `src/tools/project-preferences.ts:77` (buildMuninnInstruction blob).
  - Add `# Tier: inferred` line inside the template string above the snippet.
  - Verification: `grep -c '# Tier: inferred' src/tools/run-postmortem.ts >= 1` and same for project-preferences.ts.

- [ ] **Task 1.2.6**: Update verified callsite W3 (inline form). `commands/repo-cleanup.md:39` is `**Keep**:` bullet with inline `muninn_remember(...)` call. Add `<!-- Tier: verified -->` HTML comment on preceding line. Below the bullet, append a new sub-bullet: `- Promote: \`mcp__muninn__muninn_trust(id: <returned-id>, trust: "verified", vault: <repo_vault>)\``.
  - Files: `commands/repo-cleanup.md`
  - Verification: `grep -c 'Tier: verified' commands/repo-cleanup.md >= 1` AND `grep -c 'muninn_trust' commands/repo-cleanup.md >= 1`.

- [ ] **Task 1.2.7**: Update verified fenced-block callsites W6, W7 in `skills/arch-audit/SKILL.md` (lines 116, 126). Each gets `<!-- Tier: verified -->` above its fence and a `mcp__muninn__muninn_trust(id, trust: "verified", vault: <repo_vault>)` follow-up fenced block with intro sentence ("Promote this user-confirmed decision to verified tier:").
  - Files: `skills/arch-audit/SKILL.md`
  - Verification: `grep -c 'Tier: verified' skills/arch-audit/SKILL.md == 2` AND `grep -c 'muninn_trust' skills/arch-audit/SKILL.md == 2`.

- [ ] **Task 1.2.8**: Update verified callsite W8 `skills/luca-init/SKILL.md`. The `muninn_remember` call is invoked via the `muninnInstruction` JSON blob returned from `projectPreferences(action: "seed")`. Add `<!-- Tier: verified -->` HTML comment on the line preceding the agent-instruction step that says "JSON.parse the muninnInstruction and forward args to muninn_remember". Append a follow-up step: "After `muninn_remember` returns, capture `result.id` and call `mcp__muninn__muninn_trust(id: <result.id>, trust: \"verified\", vault: <repo_vault>)` to promote this user-confirmed preference write. (Idempotent: op_id ensures re-runs return the same id.)"
  - Files: `skills/luca-init/SKILL.md`
  - Verification: `grep -c 'Tier: verified' skills/luca-init/SKILL.md >= 1` AND `grep -c 'muninn_trust' skills/luca-init/SKILL.md >= 1`.

#### Wave 3: Tests — callsite-scan + verified-followup

- [ ] **Task 1.3.1**: Add callsite-marker scan test (Pattern 1). New `src/__tests__/memory-tier-callsite.test.ts` walks `src/instructions/*.md`, `src/subagents/*.ts`, `skills/*/SKILL.md`, `commands/*.md`, `src/tools/*.ts` (excluding `src/__tests__/`). For each occurrence of regex `mcp__muninn__muninn_remember(?:_batch)?\\(`, assert a regex `Tier: (verified|inferred)` appears within 30 lines preceding (windowing chosen to accommodate fenced-block intro headers up to 5 lines + bullet/list-item context up to 25 lines).
  - Files: `src/__tests__/memory-tier-callsite.test.ts` (new)
  - Verification: `bun test memory-tier-callsite` exits 0.

- [ ] **Task 1.3.2**: Add verified-followup scan test (Pattern 1 narrow). New `src/__tests__/memory-tier-verified-followup.test.ts`. For each `Tier: verified` occurrence in scanned files, assert `mcp__muninn__muninn_trust\\(` appears within 50 lines following (windowing accommodates intro sentence + fenced follow-up block).
  - Files: `src/__tests__/memory-tier-verified-followup.test.ts` (new)
  - Verification: `bun test memory-tier-verified-followup` exits 0; sanity check: count of `Tier: verified` markers in repo == 5.

## Verification Criteria

- All 17 callsites + 2 tool-description sites have a tier marker.
- 5 verified callsites (W1, W3, W6, W7, W8) have a `muninn_trust` follow-up.
- Both prefix sources reference `MEMORY_TIER_DISCIPLINE`.
- 3 new tests pass: `memory-tier-prefix`, `memory-tier-callsite`, `memory-tier-verified-followup`.
- Existing 178 tests still pass; tsc clean; `bun run lint` clean on touched files.
- `no-luca-leak` test still passes.
- Token budget: `MEMORY_TIER_DISCIPLINE.length < 800` chars.

## Risks & Mitigations

- **R1 drift** (HIGH): mitigated by callsite-scan + verified-followup tests.
- **R5 coverage gap** (HIGH): dual injection (D1) + single SoT constant (D2).
- **R3 brittleness** (MED): regex-marker tests not full snapshots.
- **R4 batch ambiguity** (LOW): all batches inferred (D6).
- **Inline-call form** (NEW, addressed via marker conventions): explicit prose for W3/W12, no fenced block required.
- **Token budget** (LOW): hard cap < 800 chars in Task 1.1.5 test.
