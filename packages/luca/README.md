# @alecsibilia/luca

Luca — spec-driven agentic development workflow for [Claude Code](https://claude.com/claude-code).

The `luca` CLI bootstraps [MuninnDB](https://github.com/asibilia/muninn) for long-term memory, installs the Luca skill/command/agent set into your global Claude home, and writes the per-project `.luca/` skeleton that drives the autonomous pipeline.

## What's in the box

This package is an umbrella: at build time it inlines three private workspace packages into a single self-contained tarball.

| Sub-package | Role |
|---|---|
| `@alecsibilia/luca-cli` | The `luca` command surface (init, doctor, state, phase, todo, telemetry, …) |
| `@alecsibilia/luca-core` | Deterministic logic — state machine, `.luca/` contract, telemetry, complexity routing, verification, confidence journal |
| `@alecsibilia/luca-tools` | Artifact definitions (agents, skills, commands, rules, hooks) + the compiler that emits them to the Claude Code shape |

You do not depend on those names. Just `@alecsibilia/luca`.

## Installation

```bash
bun add -g @alecsibilia/luca
# or
npm install -g @alecsibilia/luca
```

## Quickstart

```bash
luca init          # Bootstrap MuninnDB + install Claude skills/commands/agents globally
luca vault:init    # Configure the per-project MuninnDB vault
luca doctor        # Environment diagnostics
```

Then, inside Claude Code, run the `/lu` slash command to drive the autonomous pipeline.

## CLI reference

Use `luca --help` for the full surface, and `luca <command> --help` per noun group.

Lifecycle: `init`, `vault:init`, `doctor`, `retro`, `claim-verify`, `telemetry`, `rules`, `classify`, `hook`, `repair`, `version`.

Write surface (structured mutations of `.luca/`): `state`, `phase`, `roadmap`, `preferences`, `todo`, `pr-review`, `repo`, `checks`, `branch`, `workflow`, `confidence`, `verification`.

## License

MIT — see [LICENSE](./LICENSE).
