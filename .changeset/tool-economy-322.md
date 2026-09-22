---
"@alecsibilia/luca-tools": minor
---

feat: `toolEconomy` guidance flag so Bash-heavy agents batch shell probes and prefer native Grep/Glob/Read over serial grep/find/cat (#322)

Executor and Architect subagents burned tokens on serial shell probing (audit: one executor = 37 consecutive Bash calls; one architect = 33 re-deriving repo state). Adds a declarative, opt-in tool-economy discipline rendered once by the compiler and switched on for the shell-probing agents — DRY, doctrine-aligned (prefer Grep>grep, Glob>find, Read>cat; batch independent checks; reserve Bash for builds/tests/git/luca CLI).

- **luca-tools**: new `toolEconomy: z.boolean().default(false)` flag on `SubagentGuidanceSchema` (auto-available to mode-agents via the shared schema); a `## Guidance` "Tool economy" bullet rendered when set (additive — no rendered-body change for no-flag agents, so goldens stay byte-identical); flag flipped ON for executor, architect-mode, execute-mode, and reviewer. The Tool-economy bullet carves out the legitimate Bash uses and never overrides the Self-verification pre-edit re-read.
- **architect mode**: consume `research.md`/`context.md` **before** probing the codebase (research-first directive), and collapse the redundant Step 1 two-command git block (`git branch --show-current` + `git rev-parse --abbrev-ref HEAD`) to a single `luca branch guard`-led read whose result the protected-branch guard reuses.

Scope: Changes 1–3 only. The optional Change 4 consecutive-tool loop-guard PreToolUse hook is deferred (gated on unverified Task-subagent `session_id` scoping + Antigravity non-blocking-output semantics + hot-path latency). Instruction-body edits reach installed harnesses via `bun run build` + a `luca init` re-run.
