# Review Capture — Security [Wave 2]

Subagent: reviewer | Perspective: security | 2026-05-05T19:25:00Z

VERDICT: REQUEST_CHANGES

## Re-review of MUST-FIX-2 (claim-verifier traversal guard)

The iter-1 fix is INCOMPLETE. Two new MUST-FIX:

### MUST-FIX-A: existsSync short-circuit bypasses traversal guard
File: packages/luca-mastracode/src/tools/claim-verifier.ts:38-56

Trace for `p = './../etc/passwd'`:
1. isAbsolute('./../etc/passwd') → false
2. direct = join(repoRoot, './../etc/passwd') → normalizes to /etc/passwd (Linux/macOS)
3. existsSync('/etc/passwd') → TRUE → returns /etc/passwd
4. verifyFile reads /etc/passwd content via readFileSync — ESCAPE.

The guard at lines 49-56 only fires when existsSync(direct) is false. If the traversal target exists, guard is unreachable.

**My iter-1 manual test passed because** I used `path = '../../../evil.txt'` from cwd=tmp/, where existsSync(tmp + ../../../evil.txt) = false (tmp/../../../ is above tmp). That test only verified the FALLBACK path. The pre-guard existsSync vector wasn't tested.

Fix: Move guard BEFORE existsSync, or add post-join containment check `direct.startsWith(repoRoot + sep)`.

### MUST-FIX-B: Absolute-path passthrough unconstrained
File: claim-verifier.ts:39

`if (isAbsolute(p)) return p` — accepts ANY absolute path. p='/etc/passwd' bypasses everything.

verifyFile (state/claim-verifier.ts) does raw readFileSync with no containment. Schema is z.string() with no constraints.

Fix: After isAbsolute check, assert path startsWith repoRoot.

### SHOULD-FIX: Silent degradation
When guard triggers, function returns `direct` silently → verifyFile produces 'artifact-unreadable'. Caller has no signal that path was rejected as traversal.

### NOTE: '..' single segment leaks parent dir name in EISDIR error string.

CONSOLIDATED: MUST_FIX=2 SHOULD_FIX=1 NOTE=1
