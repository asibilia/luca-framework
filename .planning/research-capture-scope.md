# Research Capture — Scope

**Subagent**: researcher (returned only progress narration; supplemented by primary-agent searches)
**Perspective**: scope
**Timestamp**: 2026-05-05

## Findings

### File Inventory (`.planning/` references — 92 matches across 42 files in luca-mastracode/src)

**Tool implementations (write `.planning/`):**
- `tools/write-planning-file.ts` — generic writer, `planningDir = join(cwd, '.planning')` line 61
- `tools/manage-roadmap.ts:94-97` — direct fs write to `.planning/ROADMAP.md`
- `tools/pipeline-lock.ts:11` — `LOCK_FILE = '.planning/.luca-lock.json'`
- `tools/check-convergence.ts:11` — `CONVERGENCE_FILE = '.planning/checks-convergence.json'`
- `tools/run-postmortem.ts` — POSTMORTEM.md
- `tools/run-rules.ts` — SUGGESTED-RULES.md
- `tools/repo-cleanup.ts:165-166` — flat scan only
- `tools/confidence-journal.ts:18` — CONFIDENCE-JOURNAL.md
- `tools/manage-todos.ts:82` — `.planning/todos/`
- `tools/workflow-state.ts:312,318` — defaults `.planning/PLAN.md`, `.planning/ROADMAP.md`
- `tools/claim-verifier.ts:31,69` — fallback to `.planning/`

**State modules (under src/state/):**
- `luca-store.ts:18` — STATE_PATH for luca-state.json
- `session-ledger.ts:26-31` — ledger, routing-history, runs/
- `verification-result.ts:79` — verification-result.json + verification-history.jsonl
- `confidence-journal.ts` — JSONL + rendered MD
- `todos.ts:59` — todos/

**Subagents:**
- `subagents/shadow-scanner.ts:23,41` — config.json read
- (others)

**Instruction `.md` prompts (LLM cannot import constants — must text-update):**
- `instructions/triage.md:65` — config.json
- `instructions/research.md:11,20,70,87` — RESEARCH.md, research-capture-*.md
- `instructions/architect.md:13,21,22` — ROADMAP.md, PLAN.md
- `instructions/execute.md:30,31,104` — PLAN.md, ROADMAP.md, CONFIDENCE-JOURNAL.md
- `instructions/review.md:25,26,82` — PLAN.md, ROADMAP.md, REVIEW-*.md, review-capture-*.md
- `instructions/finalize.md:13,50,60` — REVIEW-*.md, config.json, SESSION-ARCHIVE.md
- `instructions/build.md:52` — luca-state.json

### Phase → Artifact Map

| Phase | Writes (→ phases/<slug>/) | Writes (root, KEEP) |
|---|---|---|
| triage | — | luca-state.json, .luca-lock.json |
| research | RESEARCH.md, research-capture-*.md | — |
| architect | PLAN.md, CONTEXT.md, plan-review-capture-*.md | ROADMAP.md |
| execute | CONFIDENCE-JOURNAL.md, checks-convergence.json | confidence-journal.jsonl, verification-history.jsonl, verification-result.json (debatable), session-ledger.jsonl |
| review | REVIEW-{wave}.md, review-capture-*-{wave}.md | — |
| finalize | POSTMORTEM.md, SESSION-ARCHIVE.md, SUGGESTED-RULES.md | runs/<runId>/ |

### Blast Radius

**HIGH** — 42 files, 177 string occurrences, no shared helper. Every consumer rolls its own `join(cwd, '.planning', ...)`.

### NOT Touched (root-only)

- `luca-state.json`, `.luca-lock.json`, `config.json` (cross-phase state)
- `ROADMAP.md`, `todos/` (cross-phase planning)
- `session-ledger.jsonl`, `routing-history.jsonl`, `verification-history.jsonl`, `confidence-journal.jsonl` (cross-run JSONL)
- `runs/<runId>/` (per-run archive)
