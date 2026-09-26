# Luca's checks in GitHub Actions

Question (#443, map #438): the engine's checks in `.luca/config.json` (type check, lint, `bun test`) run on Alec's Mac. Which of them pass on a GitHub Actions runner, and on which runner, macOS or Ubuntu? What fails and why, and how long does a run take?

Sources: the code on `main` at `3ba954ac2`, a local run on Alec's Mac, and two real runs of a throwaway workflow on this branch ([`.github/workflows/research-checks.yml`](../../.github/workflows/research-checks.yml)):

- Run 1: [36253089323](https://github.com/asibilia/luca-framework/actions/runs/36253089323). Bun 1.3.11 on `ubuntu-latest` and `macos-latest`.
- Run 2: [36253391275](https://github.com/asibilia/luca-framework/actions/runs/36253391275). Bun 1.3.11 and Bun `latest` (1.4.2) on both, plus a small put-back check.

Runner facts come from GitHub's docs and the runner-images readmes, linked where used.

## Short answer

- **Type check and lint pass on both runners.** All 6 jobs, with Bun 1.3.11 and Bun 1.4.2.
- **Tests pass on macOS.** All 1308 tests, in all 3 macOS jobs.
- **On Ubuntu, 2 tests fail, every time.** 1306 pass. Both failures are in `packages/engine/src/guards/worktree-state.test.ts`, where the engine puts back a file an agent changed under `node_modules`. The cause is how Bun installs packages on Linux: it hard-links them to its cache, so the agent's edit also changes the cache, and the reinstall brings the edit back. It is not flaky and not a runner problem.
- **No test needs a Paseo daemon,** `gh` signed in, the Claude login, MuninnDB, or a git name and email. The tests need git and `bun install`, and both work on both runners.
- **A full run takes about 1 to 2 minutes on Ubuntu and 3 to 5 minutes on macOS.** The tests are most of it. Jobs started within 10 seconds on both.

**Pick `macos-latest`** for the PR check and the release job. v14 runs only on macOS, all three checks pass there with no changes, and the repo is public, so macOS minutes are free. It costs about 3 extra minutes a run. Ubuntu works only after a change: skip the two tests on Linux, or make the engine install without hard links.

## The checks

`.luca/config.json` has three checks:

| Check | Command |
| --- | --- |
| `types` | `bunx --bun tsc --noEmit && bunx --bun tsc --noEmit -p packages/board` |
| `lint` | `bun run lint` (`eslint .`) |
| `test` | `bun test packages` (88 files, 1308 tests) |

The workflow ran them as three steps after `bun install --frozen-lockfile`, the same way on both runners.

## Results

| Run | Runner | Bun | Types | Lint | Tests | Job time |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `ubuntu-latest` (Ubuntu 24.04, x64, 4 CPUs) | 1.3.11 | pass | pass | 1306 pass, **2 fail** | 1m 59s |
| 1 | `macos-latest` (macOS 26, arm64) | 1.3.11 | pass | pass | 1308 pass | 4m 47s |
| 2 | `ubuntu-latest` | 1.3.11 | pass | pass | 1306 pass, **2 fail** | 1m 20s |
| 2 | `ubuntu-latest` | 1.4.2 (`latest`) | pass | pass | 1306 pass, **2 fail** | 1m 8s |
| 2 | `macos-latest` | 1.3.11 | pass | pass | 1308 pass | 3m 15s |
| 2 | `macos-latest` | 1.4.2 (`latest`) | pass | pass | 1308 pass | 4m 30s |
| — | Alec's Mac (local) | 1.3.11 | pass | pass | 1308 pass | — |

The images were `ubuntu-24.04` version 20260920.314.1 and `macos-26-arm64` version 20260907.0351.1 (from the job logs).

## What fails on Ubuntu, and why

Two tests in `packages/engine/src/guards/worktree-state.test.ts` fail on Ubuntu (run 1, job [108434674665](https://github.com/asibilia/luca-framework/actions/runs/36253089323/job/108434674665)):

- `an installed package an agent changes is put back by the engine install` (line 105)
- `an installed package an agent deletes is put back too` (line 128)

Both expect `node_modules/left-pad/index.js` to hold the real file after the engine's put-back. Both get the "cheat" file the fake agent wrote.

**Cause: Bun installs packages differently on Linux.** Bun's install docs say `hardlink` is the default backend on Linux and `clonefile` is the default on macOS ([bun.sh/docs/pm/cli/install](https://bun.sh/docs/pm/cli/install), "Platform-specific backends").

- With `hardlink`, `node_modules/left-pad/index.js` is the same file on disk as Bun's cached copy. When the fake agent writes the file in place, it also changes the cache.
- The engine puts a package back by deleting its folder and running `bun install --frozen-lockfile` (`reinstallPackages` in `packages/engine/src/guards/worktree-state.ts:771-785`; the command is `FROZEN_INSTALL` in `packages/engine/src/gates/lockfile-install.ts:11`). That install links the changed cache file back in. So the "cheat" comes back.
- The second test fails for the same reason. It runs after the first one in the same repo, so the cache already holds the "cheat" file.
- With `clonefile` (macOS), the copy in `node_modules` is its own file. Writing it leaves the cache alone, and the put-back works.

**Checked two ways:**

1. On Alec's Mac, a small script ran the same steps with a private cache, once per backend:

   | Backend | Links to the file after install | After the put-back |
   | --- | --- | --- |
   | `clonefile` (macOS default) | 1 | real file |
   | `hardlink` (Linux default) | 2 | "cheat" file |
   | `copyfile` | 1 | real file |

2. Run 2 ran the same steps in CI with each runner's default backend (the "Put-back check" step). On Ubuntu the link count was 2 and the put-back gave the "cheat" file. On macOS the link count was 1 and the put-back gave the real file. Same with both Bun versions.

This is a real gap in the engine on Linux, not just a test problem: on Linux the after-turn check can't undo an agent's in-place edit under `node_modules`. v14 is macOS only (map #438), so it doesn't matter for users today. It matters for CI only if the check workflow runs on Ubuntu.

## What the tests need, and what they don't

- **git:** yes. Many tests build real repos in temp folders (`practice-repo.ts`, `run-one-ticket`, `release`, `setup`, `worktree-state`, and more). Both runners have git 2.55.0 ([Ubuntu 24.04 readme](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md), [macOS 26 arm64 readme](https://github.com/actions/runner-images/blob/main/images/macos/macos-26-arm64-Readme.md)).
- **A git name and email:** no. Runners have none set (the workflow printed `no global git user.name` on both). Every test that commits sets its own, with `git config user.name ...` or `git -c user.name=...` (for example `packages/engine/src/testing/practice-repo.ts:244-246`, `worktree-state.test.ts:54`).
- **`bun install` inside a test:** yes, in `worktree-state.test.ts`. It installs a local tarball, so it needs no network. It works on both runners. Only the put-back after it fails on Ubuntu.
- **A Paseo daemon:** no. `paseo-board-link.test.ts` tests a pure function. The board tests use a harness (`packages/board/server/testing/board-harness`). Nothing connects to Paseo.
- **`gh` signed in, the Claude login, MuninnDB, or Jev:** no. Tests use fakes: an in-memory tracker, a scripted agent launcher, fake GitHub. `GH_TOKEN` was not set and nothing failed for it. `claude-launcher.test.ts` sets and clears `ANTHROPIC_*` env vars itself. `jev-client.test.ts` does the same for `TYPESAFE_API_KEY`.
- **Network:** only the `bun install` step before the checks, to fetch the repo's own packages from npm.

## How long a run takes

Step times, in seconds, from the job logs:

| Where | Bun | Install | Types | Lint | Tests | Whole job |
| --- | --- | --- | --- | --- | --- | --- |
| Ubuntu, run 1 | 1.3.11 | 2 | 12 | 11 | 85 | 119 |
| Ubuntu, run 2 | 1.3.11 | 3 | 8 | 7 | 56 | 80 |
| Ubuntu, run 2 | 1.4.2 | 2 | 9 | 9 | 43 | 68 |
| macOS, run 1 | 1.3.11 | 6 | 15 | 9 | 245 | 287 |
| macOS, run 2 | 1.3.11 | 3 | 9 | 7 | 168 | 195 |
| macOS, run 2 | 1.4.2 | 7 | 28 | 16 | 208 | 270 |
| Alec's Mac | 1.3.11 | 1 | 5 | 6 | 123 to 137 | — |

So plan on about 1 to 2 minutes on Ubuntu and 3 to 5 minutes on macOS. Checkout and setup-bun add only a few seconds.

Why macOS is slower: on public repos a macOS runner has 3 CPUs (M1) and 7 GB of RAM, and a Linux runner has 4 CPUs and 16 GB ([GitHub-hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)). The slow files are the end-to-end ones that make many real git calls. The same files lead on every machine, just 2 to 3 times slower on the macOS runner:

| File | Alec's Mac | Ubuntu runner | macOS runner |
| --- | --- | --- | --- |
| `engine/src/core/agent-guards.test.ts` | 17.8s | 14.4s | 31.7s |
| `engine/src/core/run-crash-recovery.test.ts` | 13.0s | 10.2s | 28.8s |
| `engine/src/core/run-session-close.test.ts` | 12.2s | 7.3s | 25.4s |
| `engine/src/jev/jev-shadow.test.ts` | 8.7s | 6.6s | 17.9s |
| `engine/src/core/run-one-ticket.test.ts` | 10.1s | 5.8s | 17.1s |

(Sums of per-test times from run 1's logs and a local JUnit report. Bun runs test files one after another.)

## Cost and limits

- The repo is public, so GitHub-hosted runners are free for it, macOS included ([GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)). On a private repo, macOS minutes cost about 10 times Linux minutes (same page).
- A free or Pro account can run at most 5 macOS jobs at once ([Actions limits](https://docs.github.com/en/actions/reference/limits)). One check job per PR, plus the release job, is well under that.
- The default job timeout is 360 minutes ([workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)). A real workflow should set a short `timeout-minutes` (such as 15) so a hung test can't burn 6 hours.

## Things to know for the workflow

- **Bun is not on the runners.** Neither image lists it, so the workflow needs `oven-sh/setup-bun@v2` ([setup-bun](https://github.com/oven-sh/setup-bun)). It caches the Bun binary, not packages.
- **The repo pins no Bun version.** No `packageManager`, no `engines.bun`, no `.bun-version`. So setup-bun with no version gets `latest`, which is Bun 1.4.2 today while Alec's Mac has 1.3.11 ([Bun releases](https://github.com/oven-sh/bun/releases)). Run 2 tried both, and the results were the same. Pin it anyway (a `bun-version` in the workflow, or `packageManager` in `package.json`), so CI and the Mac run the same Bun. Bun 1.4.2 reports a different "packages installed" count from the same lockfile; nothing else changed.
- **`ubuntu-latest` is about to change.** It moves from Ubuntu 24.04 to 26.04 between Oct 19 and Nov 19, 2026 ([runner-images #14748](https://github.com/actions/runner-images/issues/14748)). The run printed the same warning. `macos-latest` is macOS 26 on arm64 today.
- **`gh` in a workflow needs `GH_TOKEN` set by hand** (`GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`) ([GITHUB_TOKEN docs](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token)). The checks don't need it. The release job will.
- **Lint prints one warning,** "Multiple projects found, consider using a single `tsconfig` with `references`". It does the same on the Mac. It is not an error.
- **Old Luca's release job** ran on `ubuntu-latest` with `setup-bun@v2` and `bun-version: "1.3"` (`git show old-luca-final:.github/workflows/release.yml`). It ran no tests.

## What this means for #449

#449 asks which checks gate a PR and a publish, on which runner, and what happens to checks that can't run in CI. From this research:

- **All three checks can gate both,** unchanged, on `macos-latest`. Pinning `macos-26` works too; runner-images lists `macos-latest` and `macos-26` as labels for the same image ([runner-images](https://github.com/actions/runner-images)).
- **On macOS, no check has to be left out.** Nothing needs Paseo, a login, or MuninnDB.
- **On Ubuntu, one change is needed first,** for the two put-back tests. Either skip them on Linux (for example `test.skipIf(process.platform === 'linux')`), or make every engine install in a worktree use `--backend=copyfile`, which also fixes the gap for Linux users.
- **The release job's second run of the checks** adds about 3 to 5 minutes on macOS, or 1 to 2 on Ubuntu.
- **Set a `timeout-minutes`** (such as 15) on the job, since the default is 6 hours.

## Not sure

- Timings come from three jobs per runner. They varied a lot (Ubuntu tests took 43 to 85 seconds, macOS 168 to 245). GitHub does not promise runner speed.
- The 26.04 Ubuntu image wasn't tried. It should not change the hardlink result, since that comes from Bun, not the OS version.
- Only the default Bun install backend was tried in CI. A Linux fix was not tried in CI. On the Mac, `--backend=copyfile` put the file back. But the fix would have to cover every install the engine runs in a worktree (`packages/engine/src/gates/lockfile-install.ts`), not just the put-back: once a first install has hard-linked a file, an in-place write has already changed the cache. Bun documents the backend only as a command-line flag, not a `bunfig.toml` key ([bunfig docs](https://bun.sh/docs/runtime/bunfig)).
