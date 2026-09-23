# Tracer bullet findings (#334)

**PROTOTYPE, throwaway.** What the Luca v1 tracer bullet showed, on 2026-09-23.

## Verdict

**Yes, the idea works for one real ticket.** The final run put every role on Opus 5.5. It built ticket #352 end to end in 3 min 15 s, with no human help. It went through intake, red, green, one review fix round, and approval. Then it pushed and opened draft PR [#354](https://github.com/asibilia/luca-framework/pull/354). It used about 1% of the five-hour window and under 1% of the weekly window. Every guard held. Nothing tripped a rate-limit or billing stop.

Four gaps showed up. None of them stopped the run:

- The gates don't include lint.
- Nobody updates `bun.lock`.
- Agents chain shell commands, and `dontAsk` denies the whole chain.
- Two small engine bugs, one of which is fixed here.

## The final run (Opus 5.5)

- Run `run-20260923-123042-l47v`. Journal: [`runs/PROTOTYPE-wipe-me-run-20260923-123042-l47v.jsonl`](runs/PROTOTYPE-wipe-me-run-20260923-123042-l47v.jsonl).
- Preflight: Claude Max, `apiProvider: firstParty`, extra usage off. Every agent's init had `apiKeySource: "none"`, model `claude-opus-5-5`, and Claude Code 2.1.280.
- Red: the test-writer wrote 8 tests for AC1 to AC5. The red check passed on the first try. The engine committed `1f533f329`.
- Green: the implementer added `packages/tracer-sandbox/{package.json,src/slugify.ts}`. The gates passed on the first run. The engine committed `c8d21d467`.
- Review round 1: all 5 criteria met, plus 2 should-fix findings. Both said the files break the repo's prettier and eslint rules (R1-1 code, R1-2 test). The test finding went to a fresh test-writer and the code finding went back to the same implementer. The gates passed and the engine committed `518055bd6`.
- Review round 2: a fresh reviewer marked both findings resolved and approved.
- Two nits went into the PR description. R1-3: no test for "other non-ASCII is dropped". R1-4: `bun.lock` doesn't list the new workspace.
- The engine pushed `luca/tracer-run-20260923-123042-l47v` and opened draft PR #354 to `main`. Then it removed its worktree and local branch. Its secret scan found nothing.

## What worked

- **The spine, on both models.** The last two Haiku runs used `--debug-loops`, which forces a red-check failure, a gate failure, and review findings. They went through every loop: the red fix round, the gate fix round, test findings to a fresh test-writer, code findings to the same implementer, and a round-2 ruling on earlier findings (`dbg-20260923-122435-y217`).
- **The engine owns git and GitHub.** No agent moved HEAD, staged, stashed, or made a ref in any run. The backstop ran after every turn and found no path violations in the spine runs.
- **Role guards.** Reviewers never wrote a file. Test-writers only touched `*.test.ts`. The implementer never touched a test file.
- **Structured results.** Every spine turn returned a valid schema result. Assumptions and run notes flowed into later prompts and into the PR body.
- **Credential and billing checks.** They ran before every agent. Every `rate_limit_event` was `status: allowed`, `isUsingOverage: false`, `overageStatus: rejected` (`org_level_disabled`). No stop fired.

## What broke

| # | What | Fixed in the tracer? |
|---|---|---|
| 1 | The baseline gate failed on `main`: `bun test` exits 1 with "No tests found" when a repo has no tests (`dbg-20260923-045611-h7c6`). | Yes, in `8834b9de8`. With no test files, the engine now treats the run as a pass. |
| 2 | **False backstop alarm.** "Shared .git/hooks changed" threw out a clean review round (`dbg-20260923-051602-gila`, reviewer round 1). The check used `ls -la hooks/`, which also lists `..`, the shared `.git` dir. That line's mtime moves on any write to `.git`. | Yes, in `d571ba816`. It now hashes the hook files' names, modes, and contents. The next Haiku run and the Opus run had no false alarms. |
| 3 | **Lint isn't a gate.** The gates are only `bun test` and `tsc`. Round-1 review caught prettier and eslint errors, and the agents couldn't run `bun run lint` themselves (denied). | No. The reviewer caught it. See "What the engine should do". |
| 4 | **`bun.lock` never gets updated.** The implementer's `bun install` was denied, so the PR adds a workspace the lockfile doesn't list (nit R1-4). | No. |
| 5 | **Chained commands get denied whole.** Agents write `cmd1 && cmd2 \| tail`. Under `dontAsk`, one off-list part denies the whole call. The Opus test-writer tried `cat … ; git show …`, was denied, and then decided "shell access was denied". So it never ran `bun test`. The engine's own red check covered for it. | No. |
| 6 | A reviewer round that fails the guard just uses up a review round. There is no retry. That is how the false alarm in #2 cost a round. | No. It's fine once #2 is fixed, but the engine should retry. |
| 7 | Permission denials count twice in the journal (once from `system/permission_denied`, once from the result's `permission_denials`). | No. The raw messages are right; only the summary count doubles. |
| 8 | The earlier session ended mid-run in review round 2 (`dbg-20260923-050205-u9x2`). That was not a tracer bug. The two later runs finished that path. | n/a |

## Experiments

### (a) Guard checks

Journal `exp-20260923-044238-t15t` (Haiku probes: each ran one command and the engine checked the side effects).

- **`.git` denyWrite.** Denying writes to the main repo's `.git` blocked everything that writes:
  - `git commit` failed: `Unable to create '…/.git/worktrees/wt/index.lock': Operation not permitted`.
  - `git stash` failed: no stash entry was made, and the file stayed put.
  - `git branch x` failed: `cannot lock ref`.
  - `git status` still worked.
  - Control: with no deny, `git commit` in the worktree succeeded, so the deny is what blocks it.
- **Auto-allow under `dontAsk`.** With `autoAllowBashIfSandboxed: true` and no allow rule, `python3 -c "…"` **ran** and wrote a file. With `false`, it was denied ("don't ask mode"). So auto-allow must stay off.
- **Built-in read-only commands still run.** Even with auto-allow off, commands like `ls`, `cat`, `grep`, `git status`, `git show`, and `git diff --stat` ran with no allow rule (spine journals). Other commands were denied.
- **Test-file denyWrite glob on macOS.**
  - Relative glob `**/*.test.ts`: **did not hold**. `bun -e` created a new test file and overwrote an existing one.
  - Absolute glob `<worktree>/**/*.test.ts`: **held** for both (`EPERM`).
  - A non-test file could still be written.
  - The spine uses the absolute form for the implementer.
- **Reaching MuninnDB (`127.0.0.1:8750`) and Paseo (`127.0.0.1:6767`) from the sandbox.**
  - With `allowLocalBinding: false`, curl failed with exit 7 both through the sandbox proxy and with `--noproxy`.
  - With `allowLocalBinding: true`, both answered (401 and 404, the same as outside the sandbox).
  - So `allowLocalBinding` must stay false.

### (b) Strict MCP keeps `mcp__muninn__*` out

Journal `exp-20260923-044823-dmw2` (no prompt sent; the engine asked for MCP server status only).

| settingSources | strictMcpConfig | Servers loaded |
|---|---|---|
| `[]` | false | none |
| `["user"]` | false | **muninn (42 tools)**, openai-image, mobbin, paper, comfyui, and 3 disabled |
| `["user"]` | true | none |
| `[]` | true | none |

Each layer on its own keeps muninn out. The tracer uses both. In the Opus run, every init message listed only `luca` (the engine's own tool) or no servers at all, and no `mcp__muninn__*` tools.

### (c) Plan usage (Opus run)

The whole run moved the five-hour window from **3% to 4%**. The weekly window stayed at **18%** (`rate_limit_event` fractions: 0.17 → 0.18). There was no separate Opus weekly window (`seven_day_opus: null`).

| Agent | Time | Model turns | Tokens in / out / cache read / cache write | List-price estimate |
|---|---|---|---|---|
| test-writer#352.1 | 24 s | 7 | 2,768 / 2,290 / 57,194 / 16,219 | $0.19 |
| implementer#352 (2 turns) | 158 s | 16 | 3,335 / 4,344 / 196,800 / 22,027 | $0.31 |
| ticket-reviewer#352.1 | 53 s | 9 | 4,077 / 4,361 / 95,350 / 18,485 | $0.26 |
| test-writer#352.2 | 31 s | 9 | 3,376 / 3,257 / 88,583 / 10,877 | $0.17 |
| ticket-reviewer#352.2 | 26 s | 5 | 5,086 / 2,622 / 38,532 / 11,792 | $0.16 |
| **Ticket #352 total** | 3 min 15 s wall | 46 | **18,642 / 16,874 / 476,459 / 79,400** | **$1.09** |

- The list-price figure is the SDK's own estimate. It was not billed: the plan paid, and extra usage is off.
- Plan utilization only comes in whole percent (the usage endpoint) or hundredths (`rate_limit_event`). That's too coarse to measure each agent, so use token counts per agent and percent per ticket or per run.
- The plan is shared with other sessions, so treat the 1-point rise as an upper bound.
- For comparison, the Haiku runs used 3 to 5 agents, 0.3 to 0.4 M cache-read tokens, and a $0.31 to $0.41 estimate.

### (d) A message to a busy agent at its next tool call

Journal `exp-20260923-044238-t15t`, probe `4-message`.

- The engine queued a message after the agent's first tool call.
- A `PostToolUse` hook delivered it as `additionalContext` on the next Bash call, 1.6 s later.
- The agent obeyed: it put "PINEAPPLE" in its run notes.
- Reviewers are left off the bus.
- No agent sent a message on its own in any spine run. The tool exists but went unused.

### (e) A result that fails its schema counts as one failed try

Journals `exp-20260923-044238-t15t` and `exp-20260923-044841-hrsy`. The schema was impossible to meet (`minLength 5`, `maxLength 2`).

- The SDK rejected 4 `StructuredOutput` calls and sent one `[structured-output-enforce]` nudge.
- Then it ended with result `subtype: "success"` and **no `structured_output`**. It never returned `error_max_structured_output_retries`.
- The engine counted it as one failed try of kind `schema`.
- Lesson: check that `structured_output` exists and parses. Don't trust `subtype`.

### (f) The SDK under Bun

Every run was a Bun 1.3.11 process driving `@anthropic-ai/claude-agent-sdk` 0.3.273 and the installed `claude` 2.1.280. All of these worked:

- `query()` in streaming-input mode
- hooks, and the in-process MCP tool
- `accountInfo()` and `getContextUsage()`
- the usage endpoint
- `outputFormat` (the structured result)
- `close()`

Not exercised: `interrupt()` (no turn timed out) and `@getpaseo/client`.

## What the real engine should do differently

1. **Take the gates from the repo, lint included**, and allow agents to run those same commands. Here that means `bun run lint` as well as `bun test` and `tsc`.
2. **Handle the lockfile in the engine.** When a manifest changes, the engine runs `bun install` after the implementer's turn and commits `bun.lock` with the green commit.
3. **Tell agents to run one allowed command per Bash call**, with no `&&`, `;`, or pipes around off-list commands. When an agent says a gate was "denied", surface it.
4. **Backstop by content hashes only.** Never compare `ls` output or mtimes on shared `.git` paths.
5. **Use absolute sandbox `denyWrite` globs.** Relative globs don't hold on macOS.
6. **Keep these off:** `autoAllowBashIfSandboxed` and `allowLocalBinding`. Keep `settingSources: []` and `strictMcpConfig: true` together.
7. **Judge a result by its `structured_output`.** A success with none is one failed try.
8. **Retry a reviewer round that fails for an engine-side reason** instead of using up a round. Keep guard violations and bad results as failed rounds.
9. **Measure usage** with per-agent tokens, plus plan percent per ticket and per run. Keep the stop rules: `rejected`, `isUsingOverage`, `rateLimitType: overage`, extra usage on.
10. **Give agents a reason to message each other, or drop the tool.** Nobody used it.

## Other runs (local journals, not committed)

- `exp-*`: the guard, MCP, messaging, and bad-result probes, run on Haiku.
- `dbg-*`: the Haiku spine runs. `045611` stopped at the baseline bug (fixed). `045654` ran clean. `050205` was cut off by the session ending. `051602` hit the false backstop alarm (fixed). `122435` ran every loop clean.
