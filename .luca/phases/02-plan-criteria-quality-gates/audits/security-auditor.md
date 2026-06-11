PERSPECTIVE: security
VERDICT: APPROVE
FINDINGS:
- [SHOULD-FIX] User-supplied `--file` path is interpolated verbatim into agent-read output (warning lines, summary line, and the unreadable-file error message). A path containing newlines or ANSI/terminal escape bytes (legal in POSIX paths and CLI argv) can forge extra "plan lint:" finding lines or smuggle escape sequences into the orchestrating agent's context / the user's terminal. File CONTENT is never echoed (verified below), so this is the only injection channel left — low likelihood (the invoking agent chooses the path) but cheap to close.
  File: packages/luca-cli/src/write-surface/handlers/luca-plan-lint.ts:197, 209, 212
  Suggestion: Sanitize the echoed path once (e.g. strip/escape `[\x00-\x1f\x7f]` or `JSON.stringify(args.file)`) before building output lines, in both the error branch and the warning/summary lines.
  Cross-phase: false
- [NOTE] Handler ignores `ctx` (`void ctx`, luca-plan-lint.ts:205): a relative `--file` resolves against `process.cwd()`, not `ctx.cwd`. Identical today because run-handler.ts:50 passes `process.cwd()` as `ctx.cwd`, but a latent misresolution if the descriptor is ever served over an MCP transport with a different cwd. The input schema's "relative to the project root" wording (luca-plan-lint.ts:10) is only true when invoked from the project root.
- [NOTE] `readFile(args.file, 'utf-8')` has no size guard — pointing the linter at a multi-GB file loads it fully into memory before splitting. Local-CLI threat model makes this a resilience nit, not a vulnerability.

CHECKS PERFORMED (evidence for APPROVE):
1. No file-content echo / instruction-injection via plan content — verified every interpolated value in emitted text (luca-plan-lint.ts:122-147, 208-212): `connective` is captured by `/( and | with )/` (two fixed literals), `quantifier` by `/\b(all|every|complete)\b/i` (three fixed words), `f.line` is a number, all other message text is static string literals. Adversarial plan.md content cannot place arbitrary bytes or injected instructions into the lint output the orchestrating agent reads — the phase-01 precedent is correctly handled.
2. No exfiltration channel — `luca plan lint --file /etc/passwd` would read the file (any path the local user can already read; acceptable for a local CLI) but the output reveals only line numbers and finding counts, never content (luca-plan-lint.ts:208-212). Arbitrary-read adds no capability beyond what the invoking user/agent already has.
3. ReDoS — audited all six regexes (luca-plan-lint.ts:21-33, 49, 55): all are anchored or single-pass with no nested quantifiers, no overlapping alternations, no catastrophic backtracking shape (`\d+(?:\.\d+)?` is linear); each runs per-line, bounding input length. Safe against adversarial plan.md.
4. CLI wiring — plan.ts:43-48 forwards only `args.file` through `rejectUnknownFlags` + `runWriteHandler`; Zod `safeParse` (run-handler.ts:69) validates before the handler; `rejectUnknownFlags` (run-handler.ts:173-231) closes the silent-unknown-flag hole. No shell execution anywhere in the path (`node:fs/promises.readFile` only).
5. Registration — write-surface/index.ts:55 exports `lucaPlanLintTool`; cli.ts:51-53 lazy-loads `planCommand`. No additional surface introduced beyond the lint leaf. The command is read-only and exits 0 on findings (handler returns non-error; run-handler.ts:96-102), so it cannot mutate pipeline state.
6. Instruction prose — architect.ts:336-344 and skills/phase-plan/index.ts:357-363 both instruct "address each warning: fix the criterion, or justify the deviation" and explicitly subordinate lint output to the plan-reviewer's judgment. No instruction body tells agents to blindly execute or trust lint output as commands.

CONSOLIDATED:
  MUST_FIX_COUNT: 0
  SHOULD_FIX_COUNT: 1
  NOTE_COUNT: 2
  CROSS_PHASE_COUNT: 0
