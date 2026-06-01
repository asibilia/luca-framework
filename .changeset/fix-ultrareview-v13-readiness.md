---
"@alecsibilia/luca": patch
---

Fix five v13 release-readiness defects found by ultrareview on the repo-restructure branch:

- **read-only-enforcement hook removed.** The standalone `enforceReadOnly` hook blocked every `Write`/`Edit`/`NotebookEdit` in PLANNING/REVIEWING regardless of target path, defeating the v13 freeform-artifact design (the architect couldn't write `plan.md`, reviewers couldn't write `audits/*`, etc.). Dropped the hook entirely — the stage-gate hook's target-aware `artifactPathGate` is the authoritative, correct gate.
- **`luca vault:init` no longer dead-ends.** It gated on `existsSync(.luca/config.json)`, but `luca init` already writes that file — so the documented setup flow always exited "already configured". It now keys on `config.muninn?.vault`.
- **`luca init` post-setup readout retargeted to Claude Code.** It instructed users to wire MuninnDB via the removed `~/.mastracode/mcp.json`; it now points at the Claude Code MCP surface (`claude mcp add --transport sse` / `.mcp.json`) at MuninnDB's MCP endpoint (`http://localhost:8750/mcp`, distinct from the `8476` service/dashboard port).
- **F3 ledger emission fixed.** `luca state advance` emitted event names the postmortem analyzer never reads (`phase-advance`, `re-enter-pipeline`) and reused `phase-empty-justification` for the missing-artifact case (which the reader treats as proof of justification, inverting the signal). Now emits `mode-transition` + `pipeline-re-entered` (with reader-matching fields) and a new `phase-empty-detected` event backed by a new `STEP_ARTIFACT_MISSING` analyzer rule. `state.sessionId` is now bootstrapped via `generateRunId()` so ledger entries carry a real runId instead of `""`.
- **Hook-merge upgrade hygiene.** `mergeLucaHookSettings` now iterates the union of existing + bundled hook events, pruning stale luca-marked entries from retired/relocated hooks instead of leaving them behind on upgrade.

Also corrected the README "Wiring MuninnDB" section (Claude Code MCP surface, correct default port 8476).
