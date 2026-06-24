# Review Capture — Architecture [Wave 1]

**Subagent**: reviewer
**Perspective**: architecture
**Timestamp**: 2026-05-04T20:35:00Z

## Findings

PERSPECTIVE: architecture
VERDICT: APPROVE

FINDINGS:

- [SHOULD-FIX] installRules() deletes-then-recreates the target dir non-atomically; a crash between rmSync and mkdirSync leaves .mastracode/rules/ absent.
  File: packages/luca-mastracode/src/integration/install-bundled-assets.ts:99-102
  Suggestion: Write to a temp dir first, then rename. Or document the single-caller invariant.

- [SHOULD-FIX] All three install functions propagate synchronous I/O exceptions unwrapped to main(). A permission error will abort the harness with a raw Node.js stack trace.
  File: packages/luca-mastracode/src/integration/install-bundled-assets.ts:44-51, 70-77, 99-107
  Suggestion: Wrap each fn body in try/catch with a user-actionable message.

- [SHOULD-FIX] Ordering invariant expressed only in a prose comment — not enforced structurally. A future refactor could silently reintroduce #212.
  File: packages/luca-mastracode/src/launch.ts:194-200
  Suggestion: Extract the three calls into a named `installBundledAssets()` function. Consider committing the gitignored smoke test.

- [NOTE] loadAlwaysApplyRules() has a bundledDir fallback that is now dead for the normal production path (install runs before harness).

- [NOTE] defaultAssetsRoot() is called 3× per startup; a module-level const would be marginally more efficient and clearer.

CONSOLIDATED:
  MUST_FIX_COUNT: 0
  SHOULD_FIX_COUNT: 3
  NOTE_COUNT: 2
  CROSS_PHASE_COUNT: 0
