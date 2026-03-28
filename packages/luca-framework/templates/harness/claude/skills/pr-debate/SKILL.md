# pr-debate

Handle split verdict debates when PR validators disagree on a concern.

## main

<main>
# pr-debate — Split Verdict Debate Handler

Handle split verdict debates when validator agents disagree on whether a PR comment represents a valid concern.

## Context File Protocol

This sub-skill is part of the pr-address chain. It reads/writes the shared context file at `/tmp/pr-address-context.json`.

**Read:** Call `readPrContext()` from `src/skills/__schemas/pr-address-context.schemas.ts`. If `success: false`, ABORT immediately. Requires `pr_validate.split_verdicts` to be populated.

**Write:** Call `writePrContext({ pr_debate: { ... } })` to populate the `pr_debate` section.

## Optional Sub-Skill

This sub-skill is **optional** (PREMORTEM Constraint #2). The orchestrator decides whether to invoke it based on whether split verdicts exist. If no split verdicts are detected, the orchestrator sends SKIP_DEBATE to bypass this skill entirely.

## Debate Helpers

Use the following helpers from `src/skills/__helpers/pr-verdict-debate.ts`:

- `detectVerdictSplits()` — Identify split verdicts from validator results
- `buildDissenterPrompt()` — Generate prompt for the dissenting side
- `buildMajorityResponsePrompt()` — Generate prompt for the majority side
- `buildSplitVerdictResult()` — Build structured result from debate
- `formatSplitVerdictForPR()` — Format result for PR comment display

## Process

### Step 4.5.1: Dissenter Argument

For each split verdict, spawn a sub-agent using the dissenting validator type to articulate the strongest dissent:

```python
Task(
  prompt="""{dissenter_prompt_from_buildDissenterPrompt}""",
  subagent_type="{dissenting_agent_type}",
  description="Dissent: comment #{comment_id}"
)
```

### Step 4.5.2: Majority Response

After the dissenter returns, spawn a sub-agent using the majority validator type to respond:

```python
Task(
  prompt="""{majority_response_prompt_from_buildMajorityResponsePrompt}""",
  subagent_type="{majority_agent_type}",
  description="Respond: comment #{comment_id}"
)
```

### Step 4.5.3: Build Result

Use `buildSplitVerdictResult()` and `formatSplitVerdictForPR()` to construct the debate outcome:

```
Split: {split_ratio}
Majority: {position} ({count} validators)
Dissent: {position} ({count} validators)

Recommendation: {fix | disagree | defer_to_human}
Confidence: {confidence}
```

### Step 4.5.9: Write to Context File

Write debate results to the shared context file:

```typescript
import { writePrContext } from "src/skills/__schemas/pr-address-context.schemas";

await writePrContext({
  pr_debate: {
    debate_results: debateResults.map(r => ({
      comment_id: r.comment_id,
      split_ratio: r.split_ratio,
      dissenter_argument: r.dissenter_argument,
      majority_response: r.majority_response,
      recommendation: r.recommendation,
      confidence: r.confidence,
      deferred_to_human: r.deferred_to_human,
    })),
  },
});
```

## Output

On success, the context file will include:

```json
{
  "pr_debate": {
    "debate_results": [
      {
        "comment_id": "101",
        "split_ratio": "3-2",
        "dissenter_argument": "...",
        "majority_response": "...",
        "recommendation": "defer_to_human",
        "confidence": "low",
        "deferred_to_human": true
      }
    ]
  }
}
```

## Error Handling

- **Context file missing or invalid:** ABORT — pr-validate must run first
- **No split verdicts:** This should not happen (orchestrator should send SKIP_DEBATE). If it does, write empty debate_results array.
- **Dissenter agent failure:** Log warning, mark debate as inconclusive, set deferred_to_human: true

## Constraints

- This is an OPTIONAL sub-skill — failure does not halt the chain
- Do NOT re-validate comments — only debate existing split verdicts
- Do NOT plan or execute fixes — that is pr-fix's responsibility
- Each debate round consists of exactly 2 Task() calls (dissenter + majority)
</main>