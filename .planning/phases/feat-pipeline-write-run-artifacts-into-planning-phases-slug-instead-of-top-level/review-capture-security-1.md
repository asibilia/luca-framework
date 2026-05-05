# Review Capture — Security [Wave 1]

Subagent: reviewer | Perspective: security | 2026-05-05T19:10:00Z

## Findings

VERDICT: REQUEST_CHANGES

- [MUST-FIX] apply-fix action accepts arbitrary file_path / target_path with no containment check.
  File: packages/luca-mastracode/src/tools/cleanup-fixes.ts:29-53
  Detail: applyDelete/applyMove use `join(process.cwd(), filePath)` with no boundary check. LLM-supplied filePath="../../etc/passwd" would be honored.
  Suggestion: Add containment assertion mirroring write-planning-file.ts:83 pattern.
  NOTE: This is a PRE-EXISTING vulnerability (cleanup-fixes.ts not modified by this PR). Whether it is in-scope for #220 is debatable.

- [MUST-FIX] resolveArtifactPath in claim-verifier passes user-supplied `p` to join(phaseDir(slug), p) without `..`/sep rejection — file-read traversal.
  File: packages/luca-mastracode/src/tools/claim-verifier.ts:44
  Detail: phasePath() rejects '/' and '..' in filename, but resolveArtifactPath bypasses phasePath and does raw join. p="../../../etc/hosts" reads /etc/hosts.
  Suggestion: Reject path separators or '..' segments before lookup cascade.

- [SHOULD-FIX] deriveSlug concatenates raw regex-matched ticket verbatim (not slugified) — weak coupling between regex contract and phaseDir's safety.
  File: packages/luca-mastracode/src/util/phase-paths.ts:112
  Detail: Regex /\b([A-Z]{2,}-\d+)\b/ ensures [A-Z0-9-] only, but no post-construction assertion.
  Suggestion: Apply slugifySegment to ticket OR add assertion `if (!/^[a-z0-9-]+$/.test(slug))`.

- [SHOULD-FIX] currentPhaseSlug read from luca-state.json without re-validation — tampered state file injects arbitrary slug into phaseDir().
  File: packages/luca-mastracode/src/state/luca-store.ts:128-151
  Detail: All call sites pass raw state.currentPhaseSlug to phaseDir(). Tampered slug "../../../tmp/evil" redirects all phase artifact writes.
  Suggestion: Re-sanitize on read via slugifySegment; treat as absent if mismatch.

- [NOTE] confidence-journal.jsonl + session-ledger.jsonl record user intent verbatim. If .planning/ is git-committed, intent strings exposed in history.

VERIFIED-CLEAN:
  - write-planning-file.ts containment guard correct.
  - phasePath() filename guard correct.
  - slugifySegment regex correct (yields [a-z0-9-]).
  - lock-bypass design (corrupt JSON falls through silently) is documented design, not vulnerability.
  - archivePriorRun renameSync sources are constants, no symlink-injection risk.

CONSOLIDATED: MUST_FIX=2 SHOULD_FIX=2 NOTE=1
