# Luca board prototype (throwaway)

A Paseo plugin for [#343](https://github.com/asibilia/luca-framework/issues/343), "What does the board look like inside Paseo?". It shows one fake Luca run in two places, so you can pick a structure for the real board. It is not meant to be merged.

- **B v2** is a stage stack in a workspace tab.
- **C** is a set of rows in an agent's timeline.
- Variant A, a full-screen sidebar surface, was retired in v2. It stays in the branch history at 222e34c.

The fake run is "Add CSV export to reports": spec #1 with tickets #2–#8. It lives in the plugin's daemon subprocess. It moves one tick every 3 s and loops every 48 ticks, about 2.4 min. One tick is 30 s of run time, so the run plays in time-lapse.

- **Scene 1 (ticks 0–27)** puts every ticket state on the board:
  - a done refactor ticket and a done ticket
  - one building, which reaches fix 2/3 with a test failing
  - one in ticket review with 1 blocker
  - one stuck: 3 failed gate runs, then the stronger model failed too
  - one blocked by the stuck one
  - one skipped

  A limit wait covers ticks 8–12.
- **Scene 2 (ticks 28–47)** starts with a fake `skip #5` reply, and the last ticket finishes. Then the final review runs, and its 5 lenses move through Waiting → Reviewing → Fixing → Clean. The security lens keeps a blocker, the fix loop hits its cap, the stronger model fails, and the final review gets stuck waiting for `retry`, `stop`, or `ship`.

It makes no model calls, creates no agents or workspaces, and sends nothing to any agent.

## B v2: the stage stack

- **Needs you** is pinned on top. It holds the stuck tickets, each with its reason, what was tried, and the exact reply to post on the spec issue. When the final review is stuck, it shows up here too.
- **Ticket stages** follow in workflow order: Blocked → Building → Reviewing → Done → Skipped.
  - Each card has step dots for tests → red check → code → checks → review. Finished steps are filled and the current step is highlighted. A refactor ticket's first two steps are dashed, because it skips them.
  - Each card also shows the role, the model family, a one-word activity, the fix and review counters, and tokens. Tap a card for agents, per-agent tokens, and recent moves.
- **Folding:** Done and Skipped start folded to a count. Tap a stage header to open or fold it. Empty stages stay as a thin, dimmed header with 0, so the whole flow stays visible.
- **Landing flash:** a card that lands in a new stage flashes for about 1.5 s. A folded stage's header flashes instead.
- **Final review:** a second stack below the tickets, with the 5 lenses as cards. It stays dimmed until every ticket is done or skipped. When it's stuck, it shows the reason and the replies.
- **Plan usage** is green below 60%, yellow from 60% to 85%, and red above 85%. C uses the same colors.

## Open the variants

- **B:** open a workspace, then press ⌘K and choose **Luca board (prototype)**. It opens as a tab beside agents, terminals, and files. **Luca board (prototype) in the Explorer** opens the same panel in the Explorer.
- **C:** in a scratch agent's composer, type `/luca-board-demo`. Rows stream into that agent's timeline for one loop, and `/luca-board-demo stop` ends the feed early. The feed has:
  - a header row that updates in place
  - one row per stage move
  - stuck rows with the exact reply
  - a limit-wait row

Both views show a PROTOTYPE badge and a small debug line with the fake run's tick.

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
