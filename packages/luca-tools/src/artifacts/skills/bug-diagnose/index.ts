/**
 * bug-diagnose skill — Disciplined diagnosis loop for hard bugs and performance regressions.
 *
 * Ported from ~/.claude/skills/bug-diagnose/SKILL.md (current user copy) (M3 — close the asymmetry
 * with the `/bug-diagnose` slash command which was already ported in E-6). Body kept faithful to
 * the user's hand-maintained source; no `.cursor/`, `.planning/`, or uppercase artifact path refs
 * to retarget.
 */
import { defineSkill } from '../../../define/skill.ts'

const BODY = `# Bug Diagnose

A discipline for hard bugs. Skip phases only when explicitly justified.

## Phase 1 — Build a Feedback Loop

**This is the skill.** Everything else is mechanical. If you have a fast, deterministic, agent-runnable pass/fail signal for the bug, you will find the cause. If you don't, no amount of staring at code will save you.

Spend disproportionate effort here. Be aggressive. Be creative. Refuse to give up.

### Ways to construct one — try in roughly this order

1. **Failing test** at whatever seam reaches the bug — unit, integration, e2e
2. **Curl / HTTP script** against a running dev server
3. **CLI invocation** with a fixture input, diffing stdout against a known-good snapshot
4. **Headless browser script** (Playwright / Puppeteer) — drives the UI, asserts on DOM/console/network
5. **Replay a captured trace** — save a real request/payload/event log; replay through the code path in isolation
6. **Throwaway harness** — spin up a minimal subset of the system that exercises the bug code path
7. **Property / fuzz loop** — if the bug is "sometimes wrong output", run 1000 random inputs and look for the failure mode
8. **Bisection harness** — if the bug appeared between two known states, automate \`git bisect run\`
9. **Differential loop** — run the same input through old-version vs new-version and diff outputs
10. **HITL bash script** — last resort. If a human must click, structure the loop so captured output feeds back to you

### Iterate on the loop itself

Treat the loop as a product. Once you have _a_ loop, ask:

- Can I make it faster? (Cache setup, skip unrelated init, narrow test scope)
- Can I make the signal sharper? (Assert on the specific symptom, not "didn't crash")
- Can I make it more deterministic? (Pin time, seed RNG, isolate filesystem, freeze network)

### Non-deterministic bugs

Loop the trigger 100×, parallelise, add stress, narrow timing windows, inject sleeps. A 50%-flake is debuggable; 1% is not — keep raising the rate.

### When you genuinely cannot build a loop

Stop and say so explicitly. List what you tried. Ask the user for: (a) access to the reproducing environment, (b) a captured artifact (HAR file, log dump, screen recording), or (c) permission to add temporary production instrumentation. **Do not proceed to Phase 2 without a loop.**

## Phase 2 — Reproduce

Run the loop. Watch the bug appear. Confirm:

- [ ] The loop produces the failure mode the **user** described — not a different failure nearby
- [ ] The failure is reproducible across multiple runs (or at a high enough rate to debug)
- [ ] You have captured the exact symptom (error message, wrong output, slow timing)

Do not proceed until you reproduce the bug.

## Phase 3 — Hypothesise

Generate **3–5 ranked hypotheses** before testing any of them. Single-hypothesis generation anchors on the first plausible idea.

Each hypothesis must be **falsifiable**: state the prediction it makes.

> Format: "If \\<X\\> is the cause, then \\<changing Y\\> will make the bug disappear / \\<changing Z\\> will make it worse."

If you cannot state the prediction, the hypothesis is a vibe — discard or sharpen it.

**Show the ranked list to the user before testing.** They often have domain knowledge that re-ranks instantly. Don't block on it — proceed with your ranking if the user is AFK.

## Phase 4 — Instrument

Each probe must map to a specific prediction from Phase 3. **Change one variable at a time.**

Tool preference:

1. **Debugger / REPL inspection** if the env supports it. One breakpoint beats ten logs.
2. **Targeted logs** at the boundaries that distinguish hypotheses.
3. Never "log everything and grep."

**Tag every debug log** with a unique prefix, e.g. \`[DEBUG-a4f2]\`. Cleanup at the end becomes a single grep.

**Perf bugs**: logs are usually wrong. Establish a baseline measurement (timing harness, profiler, query plan), then bisect. Measure first, fix second.

## Phase 5 — Fix + Regression Test

Write the regression test **before the fix** — but only if there is a correct seam for it.

A correct seam exercises the real bug pattern as it occurs at the call site. If the only available seam is too shallow, a regression test there gives false confidence. Note this — the architecture is preventing the bug from being locked down.

If a correct seam exists:

1. Turn the minimised repro into a failing test at that seam
2. Watch it fail
3. Apply the fix
4. Watch it pass
5. Re-run the Phase 1 feedback loop against the original scenario

## Phase 6 — Cleanup + Post-Mortem

Required before declaring done:

- [ ] Original repro passes (the bug is actually fixed)
- [ ] All debug logs/probes removed (grep for your \`[DEBUG-\` tag)
- [ ] Commit message explains **why** the bug happened and the fix
- [ ] Open questions (if any) left as TODOs or follow-up issues
`

export const bugDiagnoseSkill = defineSkill({
    name: 'bug-diagnose',
    description:
        'Disciplined diagnosis loop for hard bugs and performance regressions. Build a feedback loop first, then reproduce, hypothesise, instrument, fix, and clean up. Use when user says "diagnose this", "debug this", reports a bug, says something is broken/throwing/failing, describes a performance regression, or invokes /bug-diagnose.',
    body: BODY,
})
