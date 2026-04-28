# @alecsibilia/luca-framework

Luca CLI — bootstrap MuninnDB and launch the [Mastra Code](https://mastra.ai) harness for structured, autonomous AI engineering workflows.

## What it does

Luca turns AI coding assistants into structured multi-phase development pipelines. The CLI sets up [MuninnDB](https://github.com/asibilia/muninn) for long-term memory, configures a per-project vault, runs environment diagnostics, and launches the custom Mastra Code harness defined in [`@alecsibilia/luca-mastracode`](https://github.com/asibilia/luca-framework/tree/main/packages/luca-mastracode).

## Installation

```bash
bun add -g @alecsibilia/luca-framework
# or
npm install -g @alecsibilia/luca-framework
```

## Quickstart

```bash
luca init          # Bootstrap MuninnDB
luca vault:init    # Configure vault for your project
luca doctor        # Run environment diagnostics
luca run           # Launch the Mastra Code harness
```

Once the harness is running, use the `/lu` slash command to execute the autonomous pipeline.

## CLI Reference

| Command | Purpose |
|---------|---------|
| `luca init` | Bootstrap MuninnDB |
| `luca vault:init` | Configure the project vault |
| `luca run` | Launch the Mastra Code harness |
| `luca doctor` | Run environment diagnostics and health checks |
| `luca version` | Print the installed CLI version |

## Prerequisites

- [Bun](https://bun.sh) runtime
- [MuninnDB](https://github.com/asibilia/muninn) (for long-term memory)

## Documentation

Full architecture, modes, subagents, and tools reference: [github.com/asibilia/luca-framework](https://github.com/asibilia/luca-framework).

## License

MIT
