# Which Pi package could the engine stand on?

> Research for the wayfinder ticket "Which Pi package could the engine stand on?" on "Map: Luca v1 on Pi". Date: 2026-09-22.

## Answer

- **Borrow parts, don't adopt whole.** Build the engine on the raw Pi SDK — `createAgentSession` is real (`packages/coding-agent/src/core/sdk.ts`, `earendil-works/pi`), with a full `examples/sdk/` set. That keeps "plain code, not an LLM, decides the next step" a hard guarantee, which no community package fully gives.
- **Take `@quintinshaw/pi-dynamic-workflows` as a library dependency**, not just an installed extension, for the expensive parts: worktree-per-task (merge left to the caller), journaled resume, budgets, schema-typed results. It is the only candidate with a real compiled `exports`/`main` (`dist/index.js`) — the other three are extension-only, reachable through a chat turn.
- **None of the four do GitHub-native `blocked-by` dispatch.** Computing the unblocked set and firing tickets stays the engine's own job regardless.
- **Don't lean on `pi-subagents` (either fork) for flow control.** Both hand "which agent, when, how" to the in-chat model by design; neither ships a stable non-extension SDK boundary.
- **Don't use `pi-crew`.** Its own README calls it "not a hardened, audited product," with an in-tree `docs/bugs/SECURITY-ISSUES.md` and a long internal audit-fix history.
- **Bun-under-Pi is unverified everywhere.** None of the four documents Bun compatibility; test it in the first spike.

## Fit table

| Must-have | `@tintinweb/pi-subagents` | `pi-subagents` (nicobailon) | `@quintinshaw/pi-dynamic-workflows` | `pi-crew` |
|---|---|---|---|---|
| Plain code owns the flow, not an LLM | ⚠️ deterministic JS, but only reachable via a chat tool call | ❌ "Pi decides… which agent to use" by design | ⚠️ chat-first by default, **but** ships a real importable SDK | ❌ chat-tool only; planner picks fanout |
| Starts a ticket as soon as unblocked (native `blocked-by`) | ❌ not built in | ❌ not built in | ❌ not built in | ❌ not built in |
| One worktree/ticket; engine owns git | ✅ worktree + auto-commits a branch | ✅ worktree helpers present | ✅ worktree, **"NOT auto-merged"** | ⚠️ opt-in worktree; own trust-model admits full-privilege workers |
| Per-role tools/models; typed results | ✅ per-agent tools/model; validated `schema` | ✅ per-agent tools/model; typed-gate example | ✅ tiers/exact model; `schema` with bounded repair | ✅ per-agent overrides, but `.dwf.ts` unsandboxed |
| Journal to resume; live board; budgets | ✅ hash-keyed prefix journal; FleetView; hard caps | ✅ FleetView; spawn/usage/tool budgets | ✅ `resumeFromRunId` edit-and-replay; run/phase/agent budgets | ⚠️ durable `.crew/` state; budgets thinner in docs |
| Pi 0.87 peer deps; Bun | ✅ `>=0.84.0` | ✅ `*`/`>=0.80`; background path Node-runner-based | ✅ `>=0.80.x`; real `dist/` build | ✅ `*`; `node >=22`; Bun unverified |
| License / maintenance / cadence | ✅ MIT, 1.2k★, last release 2026‑08‑27 | ✅ MIT, 3.7k★, ~101k dl/wk, released yesterday | ✅ MIT, 535★, ~32.6k dl/wk, weekly, audited fixes | ⚠️ MIT, 54★, ~830 dl/wk, self-disclosed unaudited |

## Findings

**Pi core has no subagents.** `createAgentSession` lives in `packages/coding-agent/src/core/sdk.ts` (github.com/earendil-works/pi), with a full `examples/sdk/` set. All four candidates are extensions filling that gap. Peer deps all clear Pi 0.87.0 (npm registry, 2026-09-22): `@tintinweb/pi-subagents@0.19.0` needs `>=0.84.0`; `pi-subagents@0.70.1` (nicobailon) needs `@earendil-works/pi-ai >=0.86.1`, `*` elsewhere; `@quintinshaw/pi-dynamic-workflows@3.13.0` needs `>=0.80.x`; `pi-crew@0.11.1` uses `*` with `engines.node >=22.0.0`.

**Only `@quintinshaw/pi-dynamic-workflows` ships a real library SDK.** Its `package.json` has `"main": "./dist/index.js"` and an `exports` map; `src/index.ts` exports `WorkflowAgent`, `runWorkflow`, `WorkflowManager`, `createRunPersistence`, model-tier/routing helpers. `nicobailon/pi-subagents` has an `exports` map too, but is `"private": true` and points at raw `.ts` source — a weaker contract. `@tintinweb/pi-subagents` and `pi-crew` declare no `main`/`exports`, only `"pi": {"extensions": [...]}` — chat tools only.

**Worktree/git ownership differs.** `@quintinshaw/pi-dynamic-workflows`'s `src/worktree.ts`: "Results are NOT auto-merged." `@tintinweb/pi-subagents`'s `src/worktree.ts` auto-commits changes to a branch on completion — the tool's own code, not the LLM, but more opinionated than leaving it to the caller. `pi-crew`'s README admits "workers run with your privileges; verification is best-effort... not a boundary against a malicious worker."

**Typed results and journaled resume are real in the two workflow-script packages.** `@tintinweb/pi-subagents`'s `src/workflow/runtime.ts` compiles `agent({schema})` into a validated `StructuredOutput` tool and takes `gate: "npm test"`, run inside the child's worktree; its `src/workflow/journal.ts` is a hash-keyed, JSONL-appended prefix cache for resume. `@quintinshaw/pi-dynamic-workflows` has the same `schema` option, a `verify()` that returns `{real, realCount, total, votes}` (reviewer-quorum), and `resumeFromRunId`, where "unchanged `agent()` calls replay from cache and only edited/new ones re-run." `pi-subagents` (nicobailon) ships a worked `examples/typed-gate/workflow.js`; `pi-crew` persists run state under `.crew/` but its docs are thinner on mechanism.

**Maintenance favors the two most active.** GitHub API, 2026-09-22: nicobailon/pi-subagents — 3,739★, 8 open issues, pushed today; QuintinShaw/pi-dynamic-workflows — 535★, 1 open issue, pushed 2 days ago, recent closed issues show audited fixes (#225 "O(n²) write amplification, ~190×"); tintinweb/pi-subagents — 1,208★, 114 open issues, pushed 19 days ago, with an open "workflows don't work" thread (#309); pi-crew — 54★, almost no issue history. All four are solo-maintained.

**QuintinShaw's package is an active fork, not the original.** `Michaelliv/pi-dynamic-workflows` is the stale upstream (1,225★, last pushed 2026-05-31, published separately as unscoped `pi-dynamic-workflows@1.0.1`). QuintinShaw's fork (weekly releases) is where current activity is; its `LICENSE` credits "Michael Livs (original pi-dynamic-workflows)."

**`pi-crew` self-flags as high-risk.** Its README opens: "pi-crew was developed almost entirely by AI, for the author's own workflow. It is not a hardened, audited product," and links `docs/bugs/SECURITY-ISSUES.md` and `docs/trust-model.md`. Its repo shows long internal churn (`docs/archive/pi-crew-v0.5.10-audit-fix-plan.md` through `v0.5.17`); `.dwf.ts` scripts run with full `require`/`process` access by design.

## Unverified / open

- Bun compatibility for any of the four, or the Pi SDK itself, under load — none document it; the stocktake already flagged this as a first-spike item.
- Whether nicobailon/pi-subagents' background "detached Node runner" (its own wording) forces a Node subprocess even under a Bun host.
- Brand-new entrants glimpsed on pi.dev/packages (2026-09-22), published minutes before this research, too new to judge: `@arhen/pi-core-subagent` ("in-process subagents with a dependency-graph scheduler") and `pi-daddy` ("capability governance... tool allowlists" — matches the per-role allowlist need directly).
- Exact behavior of `WorkflowManager`/`runWorkflow` fully outside a live Pi extension host — CONTRIBUTING.md implies real tests go through `createAgentSession`, but there's no standalone example in the repo.

## Sources

- github.com/earendil-works/pi (`packages/coding-agent/src/core/sdk.ts`, `docs/sdk.md`, `examples/sdk/*`); registry.npmjs.org and api.npmjs.org/downloads for all five packages; pi.dev/packages gallery — all fetched 2026-09-22
- github.com/tintinweb/pi-subagents — README, package.json, LICENSE, `src/workflow/{runtime,journal}.ts`, `src/worktree.ts`, issues
- github.com/nicobailon/pi-subagents — README, package.json, LICENSE, `examples/typed-gate/*`, issues
- github.com/QuintinShaw/pi-dynamic-workflows — README, package.json, LICENSE, CONTRIBUTING.md, `src/{index,pi-extension,workflow-manager,worktree}.ts`, issues
- github.com/baphuongna/pi-crew — README, package.json, LICENSE, repo tree (`docs/archive/*`), issues
- github.com/Michaelliv/pi-dynamic-workflows — package.json, repo metadata (stale upstream)
- `CONTEXT.md` — shared vocabulary
- `docs/research/luca-on-pi/stocktake.md` — section 6 ("Pi"), the prior survey verified here
