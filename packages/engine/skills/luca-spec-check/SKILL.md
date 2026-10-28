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

It prints one plain-text bundle: the spec's number, title, labels and body; each of its tickets (its sub-issues), in order, with number, title and body, or `No tickets yet.`; and the repo's rule files from `.luca/config.json`, and whether `GLOSSARY.md` and `docs/adr/` exist. Read it whole. Pass it to the readers unchanged.

## What not to do

- Never edit the spec or its tickets, and never commit.
- Never add or remove a label. `ready-for-agent` is the owner's call.
- Never comment on an issue without the owner's yes.
- Never run on your own: only when the owner asks.
