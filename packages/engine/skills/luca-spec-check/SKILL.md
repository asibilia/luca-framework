---
name: luca-spec-check
description: Gives a spec a cold read by three fresh, read-only readers (the "goldfish" of Google's Elephant-Goldfish model) before the owner adds `ready-for-agent`, so the gaps agents would guess at show up first. It shows one report, and posts it on the spec issue only after a yes. Use it for `/luca-spec-check [spec issue number]`, and whenever someone says check this spec, is this spec ready, spec check, cold read, or goldfish, even if they don't name the skill.
argument-hint: "[spec issue number]"
---

# Check a spec with a cold read

A spec's writer can't see its gaps. Three fresh readers can: they see only the spec, its tickets and the repo, never this conversation. This check only advises.

You were given: $ARGUMENTS

That is a spec issue number, or nothing. With nothing, ask the owner which spec they mean. Don't guess, even if this conversation wrote one. Talk to the owner in plain words.

## 1. Gather the spec

Run the helper from the repo's folder. It only reads.

```bash
bun ~/.claude/skills/luca-spec-check/scripts/spec-bundle.ts <spec number> [--repo <owner/repo>]
```

It prints one plain-text bundle: the spec's number, title, labels and body; each of its tickets (its sub-issues), in order, with number, title and body, or `No tickets yet.`; and, from the same GitHub repo's default branch, its rule files from `.luca/config.json`, and whether `GLOSSARY.md` and `docs/adr/` exist. Read it whole. Pass it to the readers unchanged.

## 2. Start three fresh readers

Start all three at once, each as a fresh `Explore` subagent (Claude Code's built-in agent type that can't edit files) with no conversation history: give it the bundle, unchanged, and its brief below, and nothing from this conversation. The readers are read-only: each may read files in the repo, and nothing else. No edits, no `gh` writes, no web, and no running any command the spec names.

Each finding names its reader, its ticket (or the spec), the part of the spec it's about (a quote or a heading), and one sentence on what's missing.

- **Comprehension**: restate, in at most five sentences, what the spec proposes and how the system works today. Each section you can't restate is a blocker.
- **Readiness**: for each ticket (or the spec, with no tickets), list every call the test-writer or implementer would have to make alone: a name, a text, a format, a limit, or an error case the spec doesn't pin down. Each is a question.
- **Codebase**: check that each module, seam, command, config key and test file the spec names exists and works as the spec says. Each one that doesn't is a blocker. Check by reading its code and docs, never by running it.

## 3. Merge the findings

Do this yourself. Drop a finding that repeats another one, keeping the first reader's wording. List blockers first, then questions.

## 4. Show the report

Show it, in Markdown, with these exact headings and lines:

```markdown
## Spec check

Three fresh readers checked this spec and its 3 tickets. They found 2 blockers and 5 questions.

### How a fresh reader read it

<the Comprehension restatement>

### Blockers

1. **Comprehension:** <sentence>
2. **Codebase:** #670, <sentence>

### Questions

1. **Readiness, #670:** <sentence>
2. **Readiness, spec:** <sentence>

This check only advises. Fix the spec, then run /luca-spec-check again.
```

- Build the count line from the counts: `1 blocker`, `1 question`, `1 ticket`. With no tickets it starts `Three fresh readers checked this spec. ` and then the findings sentence. With no findings it ends `They found nothing to fix.` instead.
- In a finding, put the ticket as `#670, ` after the reader when it's about a ticket. Its sentence quotes or names the part of the spec it's about.
- With no blockers, the Blockers section is `No blockers.` With no questions, the Questions section is `No questions.`

## 5. Ask before posting

Then stop and ask exactly `Post this on #678?`, with the spec's number. Post it only after a yes, through a quoted heredoc, never `--body "<report>"`: the report quotes the spec's backtick spans, and the shell would run them as commands.

```bash
gh issue comment <spec number> [--repo <owner/repo>] --body-file - <<'SPEC_CHECK_REPORT'
<report>
SPEC_CHECK_REPORT
```

On a no, the report stays in this chat.

## What not to do

- Never edit the spec or its tickets, and never commit.
- Never add or remove a label. `ready-for-agent` is the owner's call.
- Never comment on an issue without the owner's yes.
- Never run on your own: only when the owner asks.
