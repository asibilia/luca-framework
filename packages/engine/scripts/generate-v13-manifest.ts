/**
 * Builds `packages/engine/src/doctor/v13-files.json`: the fingerprints of
 * every file old Luca v13 installs, plus the settings and `.gitignore` block
 * it writes, so `luca doctor` can find v13 leftovers by content with no
 * network and no git.
 *
 * ```bash
 * # Regenerate the data file (needs npm and the network):
 * bun packages/engine/scripts/generate-v13-manifest.ts
 *
 * # Check this computer against the committed file. Read-only: it hashes
 * # and reads, and never writes, moves or deletes anything.
 * bun packages/engine/scripts/generate-v13-manifest.ts --verify \
 *     --repo ../some-repo --repo ../other-repo
 *
 * # Point the ~/.claude/ half of the check at another folder, such as a
 * # backup of an old ~/.claude/:
 * bun packages/engine/scripts/generate-v13-manifest.ts --verify \
 *     --claude-home ~/.claude-old-luca-backup-2026-09-22
 * ```
 *
 * How it works: it lists every published 13.x version of `@alecsibilia/luca`
 * (alphas too), downloads each with `npm pack` into a temp folder, and reads
 * that version's own install code (`dist/**.mjs`) to learn what it installs
 * and where. Each feature is found by markers, literal strings from v13's
 * install code (see `old-luca-final:packages/luca-cli/src/init/helpers/`).
 * The first marker says whether a version has the feature; a version that has
 * it but lacks any other marker stops the run, because its install code
 * changed shape and this generator needs a look.
 *
 * The transform rule: every v13 version copies skills, agents, commands, hook
 * scripts and the status line script with `copyFile`, byte for byte, with no
 * templating or path substitution. So a file's fingerprint is the sha256 of
 * the file as shipped in the tarball. The generator checks this in each
 * version's copy functions and stops if one ever edits content. The only
 * values v13 fills in are inside settings (the home folder in the status line
 * command, the MuninnDB token), which the manifest records as `{home}` and
 * `{muninn_token}`.
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { generate } from './v13-manifest-read'
import { verify } from './v13-manifest-verify'

import { V13_MANIFEST_PATH } from '../src/doctor/v13-manifest'

// ─── Main ───────────────────────────────────────────────────────────────────

const { values: args } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
        verify: { type: 'boolean', default: false },
        repo: { type: 'string', multiple: true, default: [] },
        'claude-home': { type: 'string', default: join(homedir(), '.claude') },
        out: { type: 'string', default: V13_MANIFEST_PATH },
    },
    strict: true,
})

if (args.verify) {
    await verify({ repos: args.repo, claude_home: args['claude-home'] })
} else {
    await generate({ out: args.out })
}
