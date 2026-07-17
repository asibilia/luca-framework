# skill-opt (caveman)

A proof-of-concept port of [microsoft/SkillOpt](https://github.com/microsoft/SkillOpt)
to a Luca skill. It treats a **skill body as trainable text** and improves it with
a validation-gated loop — the model stays frozen, only the markdown changes.

`caveman` is the ideal first target: its output is **objectively gradable**. The
reward is the fraction of baseline tokens saved, gated by an LLM judge that the
terse answer preserved all technical substance. No workflow-run grading required.

## The loop

```
rollout(train) → reflect(worst) → bounded edits (≤ budget) → gate(val) → accept/reject
```

- **rollout** — answer each corpus question under the current skill body; score it.
- **reflect** — an analyst LLM reads the worst rollouts and proposes ≤ L bounded
  edits (`append` / `insert_after` / `replace` / `delete`). L is the "textual
  learning rate".
- **gate** — the candidate is accepted only if its mean **VAL** reward strictly
  beats the current skill. Rejected edits are logged as negative feedback.
- **evaluate** — held-out **TEST** is scored once at the end for both the seed
  and the best skill, so the reported lift is honest.

## Reward

```
reward = judge.pass ? clamp(1 − candidateTokens / baselineTokens, −1, 1) : −1
```

Compression is rewarded; substance loss is a hard −1. `baselineTokens` is a
verbose, skill-free answer to the same question (computed once, cached).

## Run

```bash
cd packages/luca-tools/skill-opt

# Deterministic, NO API spend — proves the plumbing end to end.
bun run.ts

# Real optimization on your existing Claude Code auth (spends budget).
bun run.ts --backend claude --epochs 6 --edit-budget 3 --minibatch 4 --gate on
```

Flags: `--backend mock|claude` · `--model <name>` · `--epochs N` ·
`--edit-budget N` · `--minibatch N` · `--gate on|off`.

## Output (staged, never live)

Everything lands in `staging/<runId>/` (gitignored):

- `best-skill.md` — the optimized caveman body **to review before adopting**
- `seed-skill.md` — what the run started from
- `report.md` — held-out seed→best table + per-epoch accept/reject log
- `rejected-edits.jsonl` — edits the gate blocked

**Adoption is manual and explicit** (SkillOpt's stage→adopt discipline): if the
report shows a real held-out lift, fold `best-skill.md` back into the `BODY`
literal in `src/artifacts/skills/caveman/index.ts` yourself. The loop never
writes the live skill.

## Files

| File | Role |
|------|------|
| `types.ts` | Zod schemas: corpus item, edit, patch, equivalence, rollout |
| `corpus/*.jsonl` · `load-jsonl.ts` | Fixed train/val/test task sets + generic JSONL loader |
| `backend.ts` | `ChatFn` backends: deterministic `mock` and `claude` CLI |
| `task.ts` · `tasks/*.ts` | The `Task` interface + per-skill definitions (analyst/judge prompts, rollout, reward) |
| `reflect.ts` | Worst-rollout → bounded edits (budget-clipped) |
| `apply-edits.ts` | The four bounded edit ops (append / insert_after / replace / delete) |
| `loop.ts` | The epoch loop: rollout → reflect → gate → accept/reject |
| `run.ts` | CLI entry + report/staging writer |
| `json.ts` | Tolerant JSON extraction from LLM output |
| `estimate-tokens.ts` | Rough token estimate for the length-ratio reward |
| `pmap.ts` | Bounded-concurrency async map |

## Next targets

Once this loop is trusted, point the same harness at the other gradable
sub-steps: **complexity classification** (5-class label, exact-match), `choose`
routing, `rename-audit` / `repo-audit` (set precision/recall). Open-ended skills
(`phase-execute`, `bug-diagnose`) are NOT gradable this way — they belong on the
telemetry-metric / SkillOpt-Sleep track instead.
