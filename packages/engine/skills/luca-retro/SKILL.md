---
name: luca-retro
description: Looks back at a finished Luca run and suggests changes to the agents' environment, not the code, so the next run goes better. It reads the run's journal, ranks what went wrong (most serious first), and says for each one the change to make and where: a check to add, a line for the repo's rules file, an instruction to delete, missing information, waste, or a Luca bug. Once the owner picks findings by number, it opens a GitHub issue for each, after a yes. Use it for `/luca-retro [run id ...]`, and whenever someone asks for a retro, what went wrong in the run, how to stop this happening again, or the lessons from a run, even if they don't name the skill.
argument-hint: "[run id ...]"
---

# Look back at a Luca run

A retro changes the agents' environment, not the code: when an agent got something wrong, ask what would have stopped it. A mistake a machine can spot gets a check (a lint rule, a gate, a guard, a CI job). A judgement call gets one line in the repo's rules file. An instruction that changed nothing gets deleted. Run by hand after a run, so the rules get shorter over time, not longer.

You were given: $ARGUMENTS

That is zero or more run ids. Talk to the owner in plain words: short sentences, no jargon they didn't use first.

## 1. Read the run

Run the helper from the repo's folder. It only reads.

```bash
bun ~/.claude/skills/luca-retro/scripts/retro-summary.ts [run id ...]
```

- No run id: it sums up this repo's newest finished run (one that opened its PR, was stopped, or had nothing to do), found from the main checkout, any of its worktrees, or a subfolder. If that isn't the one the owner means, ask.
- Several run ids: it sums up each, then lists the patterns that repeat across them. A repeat ranks higher.
- It prints the run's spec, repo, Luca versions, and how it ended; then what got stuck and how long the owner took to reply, fix loops that hit their cap, leftover scan hits, agents out of turns, "No open agent session" failures, Jev calls that failed, checks and tests that failed again and again, setup changes agents asked for, joins that clashed, replies, the agents' assumptions, the findings fixers declined, slow steps, and tokens. Every line names its journal seq (`#123`).

The journal is all there is: agents run without saved sessions, so there are no transcripts. To read one record in full: `jq -c 'select(.seq == 123)' ~/.local/state/luca/runs/<run id>/journal.jsonl` (or under `$LUCA_RUNS_DIR`). The records are JSON lines: `seq`, `time`, `kind`, `ticket`, `role`, `content`.

When a finding needs it, look (read only) at what the agents were given in the run's repo: the rule files listed in `.luca/config.json` (`rule_files`, also `test_file_patterns` and `test_setup_files`), `AGENTS.md` or `CLAUDE.md`, the glossary and ADRs, the lint config, and the CI config. Check whether a rule already covers the mistake before suggesting one.

## 2. Rank the findings

List them most serious first: what cost the most time, tokens, or owner replies, and what repeats. For each:

1. **What happened**, with evidence: seqs, tickets, counts. Say it plainly.
2. **Its bucket**, one of six:
   - **(a) Check to add**: a lint rule, a gate, a guard, or a CI job, for a mistake a machine can spot.
   - **(b) Rules line**: one line for the repo's rules file, for a judgement call.
   - **(c) Delete**: an instruction that changed nothing, or one so long it hid the rest.
   - **(d) Missing information**: a glossary word, an ADR, a setup step the agents had to guess (their assumptions show these).
   - **(e) Waste**: tools or tokens spent for nothing, such as agents out of turns, steps far slower than the rest, or calls that always fail.
   - **(f) Luca bug**: the engine itself went wrong. It goes to `asibilia/luca-framework`, not the repo.
3. **The change**, and where: the file and the words, or the check and what it catches.

Prefer (a) over (b) when a check can catch it: a check works every time, a rule only when read. Prefer deleting over adding. Leave out what happened once and can't happen again.

Some signs, from the helper's sections:

- The same stuck reason (such as `leftovers_found`) again and again: a rule or a check, or a Luca bug when the engine was wrong to block it.
- A `setup_change_needed`: the repo's setup was missing something every ticket like it will need.
- Agents out of turns, or "No open agent session" failures: often (e) or (f).
- A `jev_failed` on every call: a missing key or setting, (e).
- One test failing in many gates: a flaky or build-bound test, (a) or (f).
- Many assumptions about the same thing: (d).
- A finding declined with `wont_fix` for a reason the run can't change (a role can't write a file): (f) or (b).

## 3. Stop

Show the ranked list, numbered, and stop. Nothing happens until the owner picks findings by number.

## 4. Open an issue for each pick

For each finding the owner picked:

1. Check for one already open or closed: `gh issue list --repo <owner/repo> --search "<a few words>" --state all`. If one fits, link it instead of opening a new one.
2. Otherwise show the issue's exact title and body, and the repo it goes to: Luca bugs to `asibilia/luca-framework`, the rest to the run's repo (the "Repo" line). Put the evidence in the body: the run id, the seqs, the Luca version.
3. Wait for a yes, then open it: `gh issue create --repo <owner/repo> --title "<title>" --body "<body>"`. Say the link.

## What not to do

- Never edit code or rule files, and never commit. The issue says what to change; a person or a later run does it.
- Never open an issue without the owner's yes.
- Never run on your own: only when the owner asks.
- Never edit the journal. It is the engine's.
