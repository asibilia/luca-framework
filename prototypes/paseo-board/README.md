# Luca board prototype (throwaway)

A Paseo plugin for [#343](https://github.com/asibilia/luca-framework/issues/343), "What does the board look like inside Paseo?". It shows one fake Luca run in three places, so you can pick a structure for the real board. It is not meant to be merged.

The fake run ("Add CSV export to reports", spec #1, tickets #2–#8) lives in the plugin's daemon subprocess. It moves one tick every 3 s and loops every 48 ticks (about 2.4 min). One tick is 30 s of run time, so the run plays in time-lapse.

- Scene 1 (ticks 0–27) puts every ticket state on the board: a done refactor ticket, a done ticket, one building (it reaches fix 2/3 with a test failing), one in ticket review with 1 blocker, one stuck (3 failed gate runs, then the stronger model failed too), one blocked by the stuck one, and one skipped. A limit wait covers ticks 8–12.
- Scene 2 (ticks 28–47) starts with a fake `skip #5` reply. The last ticket then finishes, and the final review runs through 5 lenses until it gets stuck and waits for `retry`, `stop`, or `ship`.

It makes no model calls, creates no agents or workspaces, and sends nothing to any agent.

## Open the variants

- **A, mission control (sidebar surface):** choose **Luca board (prototype)** in the sidebar. You can also use ⌘K → "Luca board (prototype): A, mission control".
- **B, dense list (workspace panel):** open a workspace, then ⌘K → "Luca board (prototype): B, dense list tab". A second item opens the same panel in the Explorer instead.
- **C, timeline rows:** in an agent's composer, type `/luca-board-demo`. Rows stream into that agent's timeline for one loop. `/luca-board-demo stop` ends the feed early. Use a scratch agent (see below).

Every view has a PROTOTYPE badge and a small debug line that shows the fake run's tick.

## About variant C

Plugin rows are appended with `paseo.agents.ref(id).timeline.append`. The public docs don't say whether those rows reach the model. Reading the Paseo v0.9.1 source says they don't:

- The formatter that turns a timeline into text has no case for plugin rows.
- Fork history keeps only user messages, assistant messages, and tool calls.
- Providers receive only prompts.

Still, try C in a scratch agent first. Some caveats:

- Rows live only in the daemon's memory. A daemon restart or a conversation rewind removes them.
- Each append counts as agent activity.
- Other plugins' `agent.turn_ended` hooks can see the rows.

## Develop

```bash
bun install
bunx tsc --noEmit
paseo plugin reload luca-board-prototype
paseo plugin logs luca-board-prototype
```

## Remove

```bash
paseo plugin remove luca-board-prototype
```

This leaves the source directory in place. The plugin also stops when you disable it under **Settings → Plugins**.
