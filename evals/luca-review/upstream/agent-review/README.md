# Agent Review

**Your agents say they're done. Here's how to know.**

Agents fail in three ways: they overstate what they did, they get the facts wrong, and they get the reasoning wrong. Agent Review is one skill with a level of review for each, so you can hand agents real work and rely on what comes back.

It's the companion to my talk [*I Believe Everything My Agents Tell Me: The Three-Level Review That Makes That Safe*](https://gallon.me/i-believe-everything-my-agents-tell-me) at AI Engineer NYC 2026. **[Read the write-up →](https://gallon.me/i-believe-everything-my-agents-tell-me)**

## The three levels

| Level | Prevents agents | How it works |
| --- | --- | --- |
| **1. An artifact, or a named failure** | overstating what they did | The job names the file, where it goes, and the check. The agent ends with `ARTIFACT-VERIFIED` and a fingerprint, or `ARTIFACT-MISSING` and the reason. Then the sender runs the check itself. "Done" on its own is never an answer. |
| **2. Two agents, checked against the source** | getting the facts wrong | Find a total in the source the answer must match. Two agents do the same job without seeing each other's work. A third settles every difference against the original source, and never forces a match. |
| **3. Adversarial review** | getting the reasoning wrong | The agent audits its own claims. Cold reviewers, each playing a real reader with reasons to find fault, tear the work apart. Then brand-new reviewers check the final version with fresh eyes. |

Each level adds to the one before as the stakes go up. Use Level 1 whenever you delegate, add Level 2 when the facts have to be exact, and add Level 3 before a conclusion drives a decision or goes out the door.

## What makes it work

- **Evidence, not assertions.** Every claim is marked measured, checked against the source, inferred, or assumed. Anything the agent can't back up gets tested or labeled as a guess.
- **Independence that's real.** Reviewers get the work and the sources. They never get the history, the drafts, or the answer the author was hoping for.
- **Findings get checked too.** Reviewers can be wrong, so every finding is verified against the source before anything changes, and every fix is checked by an agent that didn't write it.
- **Reviews that converge.** Fix, check, and run fresh eyes again, until a new round finds nothing that matters.
- **Built for Claude Code and Codex.** Mix models: a reviewer on a different model can catch what another misses.

## Quick start

Install it as a skill:

```sh
# Claude Code
git clone https://github.com/captivus/agent-review.git ~/.claude/skills/agent-review

# Codex
git clone https://github.com/captivus/agent-review.git ~/.agents/skills/agent-review
```

Then ask for it by name (`/agent-review` in Claude Code, `$agent-review` in Codex) or just describe the stakes:

> Use Level 1 to delegate the database migration, and make the agent prove it ran.

> Use Level 2 to extract every invoice line from these statements and reconcile both passes against the totals.

> Run Level 3 on this report before I publish it.

### Make the self-audit a habit

Add this to your `CLAUDE.md` or `AGENTS.md`, and your agent will check its claims even when the skill isn't loaded:

```text
Before stating a claim as a conclusion, classify it as measured, verified
against source, inferred, or assumed. Test consequential gaps when possible;
otherwise label them as hypotheses. Use agent-review for the full procedure
when the stakes require it.
```

## Go deeper

- [**SKILL.md**](SKILL.md): the full method, level by level.
- [**references/**](references/): copyable dispatch briefs, reviewer prompts, and the findings register.
- [**references/tool-notes.md**](references/tool-notes.md): project installs, and how to set up truly independent reviewers in Claude Code and Codex.

## License

[MIT](LICENSE). Made by [Corey Gallon](https://gallon.me).
