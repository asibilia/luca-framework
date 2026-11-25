#!/usr/bin/env bun
/**
 * Runs every check in the repo's `.luca/config.json` (its test commands,
 * then its slow test commands, then `types`, then `lint`), read from that
 * file, so the repo's gate (`.github/workflows/gate.yml`) and Luca's own
 * gates can't drift apart. It's
 * `luca check` for this repo (#788): both run `runRepoChecks`. Fast `bun`
 * test commands get the config's `test_case_timeout_ms` as `--timeout`
 * (#580), as in the gates; slow and `pass_fail` commands never do.
 *
 * Every check runs, even after one fails; the script exits 1 if any failed.
 *
 * Usage: bun scripts/run-checks.ts
 */
import { join } from 'node:path'

import {
    runRepoChecks,
    runShellCheck,
} from '../packages/engine/src/config/repo-checks'

process.exit(
    await runRepoChecks({
        repo_root: join(import.meta.dir, '..'),
        pick: { only: null, skip_slow: false },
        run: runShellCheck,
    })
)
