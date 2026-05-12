---
title: "Telemetry janitor: archive old .planning/telemetry/&lt;runId&gt;.jsonl files across resets"
area: telemetry
created: 2026-05-12
priority: low
source: research
---

## Task

Telemetry janitor: archive old .planning/telemetry/&lt;runId&gt;.jsonl files across resets

---
confidence: medium
externalResearch: false
priority: 4
---

# Context

Discovered during scope research for the per-phase wave duration telemetry todo: `archivePriorRun` in session-ledger.ts:365-394 has a static sources list of root-level `.planning/*.jsonl` files. It does NOT move `.planning/telemetry/<runId>.jsonl` files. Across pipeline resets, the `telemetry/` dir accumulates unboundedly.

Non-destructive (filenames are runId-keyed) but operationally messy after many resets.

## Scope

- Decide policy: either move files into `runs/<runId>/` on reset (consistent with other JSONL artifacts), OR add a separate janitor that prunes files older than N days.
- Likely cleanest: include `.planning/telemetry/<runId>.jsonl` in `archivePriorRun`'s sources list, but use the per-file path rather than the directory.

## Depends on

- Per-phase wave duration telemetry todo must ship first (creates the files this todo manages).

## MuninnDB Recall

Search MuninnDB for 'telemetry archive lifecycle' or 'archivePriorRun sources'.

