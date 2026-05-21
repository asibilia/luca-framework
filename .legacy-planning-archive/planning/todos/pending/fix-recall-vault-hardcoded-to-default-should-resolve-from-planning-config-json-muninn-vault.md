---
title: "fix recall vault hardcoded to "default" — should resolve from .planning/config.json muninn.vault"
area: telemetry
created: 2026-05-16
priority: medium
source: telemetry-analysis
---

## Task

fix recall vault hardcoded to "default" — should resolve from .planning/config.json muninn.vault

## Problem

Both Run 1 and Run 2 show `recall.miss` records with `vault: "default"` regardless of project. The consuming repo (e.g. `joes-book--next`) has its own vault, but the recall call uses `"default"` literally.

This pollutes hit-rate metrics in the aggregator and means subagents are recalling against the wrong vault.

## Root cause

Mode prose for `muninn_recall` calls likely hardcodes `vault: "default"` or omits the field (which defaults to "default"). The canonical resolution path is `.planning/config.json → muninn.vault` with `"default"` fallback.

This was supposedly fixed in PR #236 (finalize.md:241 + run-postmortem.ts:32) but only for postmortem pitfall storage. The same bug exists in pre-invoke recall calls across all mode files.

## Acceptance criteria

1. Grep all mode files for `vault: "default"` and `muninn_recall` calls without `vault:` parameter.
2. Replace literal `"default"` with `<vault from .planning/config.json → muninn.vault, fallback "default">` directive prose pattern.
3. Add regression test: scan mode files for `vault: "default"` as a literal string in `muninn_recall` examples → fail.
4. Verify in a fresh run that `recall.hit`/`recall.miss` records emit the actual vault name.

## Related

Existing todo #18 (`finalize.md:231 postmortem pitfall storage hardcodes vault: "default"`) is the same bug class — but for the finalize postmortem path, already partly fixed. This todo covers the recall-prose path which is broader (all 6 mode files).

Could supersede #18 when shipped.
