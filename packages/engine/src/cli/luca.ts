#!/usr/bin/env bun
/**
 * `luca`: the command people run, with subcommands:
 *
 *   luca init [--skip-muninndb] [--skip-skills]
 *                                  sets up this computer, once
 *   luca setup [--base <branch>]   gets the repo in this folder ready
 *   luca upgrade [--to <version>]  moves to another version of Luca
 *   luca hook <anything>           does nothing, quietly
 *
 * `luca hook` is for old Luca (v13), whose global Claude Code hook runs
 * `luca hook stage-gate` before every edit, write, and shell call: it exits
 * 0 and prints nothing, so that hook never blocks. It loads nothing else.
 *
 * `luca --help` prints the usage and exits 0; an unknown subcommand prints
 * it and exits 2.
 */

const USAGE = `Usage: luca <command>

Commands:
  init [--skip-muninndb] [--skip-skills]
                            Set up this computer for Luca (once)
  setup [--base <branch>]   Get the repo in this folder ready for Luca
  upgrade [--to <version>]  Move to the newest Luca on your channel, or to <version>`

const main = async (): Promise<number> => {
    const [command, ...rest] = Bun.argv.slice(2)
    switch (command) {
        case 'hook':
            return 0
        case 'init': {
            const { initCommand } = await import('./init-command')
            return initCommand({ argv: rest })
        }
        case 'setup': {
            const { setupCommand } = await import('./setup-command')
            return setupCommand({ argv: rest })
        }
        case 'upgrade': {
            const { upgradeCommand } = await import('./upgrade-command')
            return upgradeCommand({ argv: rest })
        }
        case '--help':
        case '-h':
        case 'help':
            console.log(USAGE)
            return 0
        default:
            console.error(USAGE)
            return 2
    }
}

process.exit(await main())
