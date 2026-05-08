---
title: "finalize.md:231 postmortem pitfall storage hardcodes vault: "default" — should use repo vault"
area: memory
created: 2026-05-08
priority: low
source: research
---

## Task

finalize.md:231 postmortem pitfall storage hardcodes vault: "default" — should use repo vault

## Context

Discovered during scope research for memory-tier-promotion: `src/instructions/finalize.md:231` invokes `muninn_remember` with `vault: "default"` hardcoded, while every other callsite in the package resolves vault from `.planning/config.json` → `muninn.vault`. Result: postmortem pitfalls land in the wrong vault when a repo defines its own `muninn.vault`.

## Fix

Replace literal `"default"` with `<repo_vault>` placeholder consistent with neighboring callsites (e.g., finalize.md:87, learner.ts:38).

## MuninnDB Recall

Search MuninnDB for `research:luca-mastracode-prose-callsite-inventory-muninn-remember`.
