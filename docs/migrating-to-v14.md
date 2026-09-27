# Moving from Luca v13 to v14

Luca v14 is a new Luca. v13 ran inside your Claude Code session, with its own skills, agents, commands, and hooks. v14 is an engine: plain code that takes a spec's tickets to one reviewed pull request, while Claude agents write the tests and the code. You start a run from Paseo, and the board shows it live.

This guide is for people who used `@alecsibilia/luca` v13. It says what's gone, what replaced it, and how to clean up.

## What's gone

- **`/lu` and `/luca-init`.** v13's slash commands for planning and running work are gone, with the rest of its commands.
- **v13's skills, agents, and commands** in `~/.claude/` (and the repo's `.claude/` hooks). v14 installs none of its own there.
- **The hooks.** The global `luca hook stage-gate` hook in Claude Code's user settings, and each repo's hook scripts (`pipeline-guard`, `context-refresher`, `continuation-messages`) with their wiring in `.claude/settings.json`. v14's `luca hook ...` does nothing and exits 0, so a leftover global hook can't block your edits, but it should still go.
- **`luca vault:init`.** `luca init` sets up MuninnDB once per computer, and `luca setup` keeps your repo's vault when it converts the old `.luca/config.json`.
- **The status line** (`~/.claude/luca-statusline.ts`).
- **Antigravity support.** v14 runs in Claude Code only. v13's copies in `~/.gemini/antigravity-cli/` (its hook, skills, agents, and `muninn` MCP entry) are leftovers.
- **`~/.luca/`**, v13's own MuninnDB and state. v14 uses a MuninnDB that `luca init` installs.

## What replaced it

- **Planning: Matt Pocock's skills.** `luca init` installs them: `to-spec`, `to-tickets`, `setup-matt-pocock-skills`, `grilling`, and `domain-modeling`. Run `/setup-matt-pocock-skills` once in your repo, then write a spec with `/to-spec` and split it into tickets with `/to-tickets`.
- **Building: `/luca-run`.** In a Paseo chat, type `/luca-run <spec number>`. The engine takes the spec's tickets through tests, code, and review, and ends in one pull request.

## Moving over

1. Install v14. While it's in alpha, that's:

   ```bash
   bun add -g @alecsibilia/luca@alpha
   ```

2. Clean up what v13 left behind. Run this in your terminal, from inside each repo where you used v13:

   ```bash
   luca doctor --fix
   ```

   It finds v13's files by their content, not their names, so your own files that share a name (like `research` or `plan`) are never touched. It removes the hook wiring before it moves the hook scripts, so no tool call breaks halfway. It never deletes: v13's files go to a dated backup folder, `~/.local/state/luca/v13-backup/<date>/`, with their paths kept, and each settings file it edits is copied there first. It keeps `~/.luca/` while its MuninnDB data folder isn't empty. It never commits: it lists the repo files to commit (such as the de-hooked `.claude/settings.json` and the new `.luca/config.json`), so your team gets the change too.

3. Set up this computer and your repo:

   ```bash
   luca init
   luca setup
   ```

4. Run `luca doctor` again. Every line should say OK.

## One global `luca`

One computer holds one global `luca` command, so v13 and v14 can't sit side by side. If you want to stay on v13, don't install v14: v13 stays on npm. If `luca doctor` finds another `luca` on your PATH, such as v13 installed with npm, it tells you how to remove it.
