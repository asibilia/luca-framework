# Luca board: the panel and the chat rows

The plugin shows a run in two places:

- **The side panel** ("Luca board", a workspace tab that also opens in the Explorer). From top to bottom it shows:
  - plan usage (five-hour and weekly), from the rate-limit readings in the agents' sessions, colored green below 60%, yellow from 60% to 85%, and red above 85%
  - how much of the plan the whole run used, once the engine records it
  - a banner when the run stopped (for example, the wrong credentials, or a billing stop) or its engine stopped
  - a limit-wait banner that names the window that was hit
  - **Needs you**, pinned on top: stuck work, with the reason, what was tried, and a button for each reply the engine takes, and **Help me** (see [Replying from the board](replying.md))
  - the tickets, as a stack of stages: Blocked → Building → Reviewing → Testing → Fixing → Joining → Done → Skipped. A stage says what the ticket is really doing (#549): Building is its first test-writer and implementer pass; Reviewing, only while a reviewer works; Testing, the red check or the checks running; Fixing, any fix round (after the checks, a review, or a join); Joining, joining the run branch and the checks there, until the run branch is pushed. Each card has step dots for tests → red check → code → checks → review. A refactor ticket's first two dots are dashed, because it skips them. Done and Skipped start folded. A card shows how much of the plan its ticket used, once the engine records it. Tap a card for its details.
  - **For a person**, only when the run left some tickets out (#499): the tickets labeled `ready-for-human`, and the ones that wait on them, each with why ("for a person", or "waits on #12, which is for a person"). They aren't a problem, so this is a quiet, muted list that starts folded, never in **Needs you**.
  - the final review's 5 lenses, as a second stack (Waiting → Reviewing → Fixing → Clean). It stays dimmed until every ticket is done or skipped. A run that ended with nothing to do, or that intake refused, has nothing to review, so the panel leaves this section out and the header row says "none, nothing to review".
  - the footer: the run id, its event count and whether the engine runs, the latest thing that happened with its age ("latest (4m 43s ago): #557: started.", counting up every second), and the counters.
- **One line, tap for more** (#626): every line of a ticket card, and every footer line, stays on one line. Text that doesn't fit ends in "…". A tap on a cut line opens a small bubble with all of its text; a second tap, or a tap anywhere else on the card, closes it. On a computer, hovering opens it too. One bubble is open at a time. The fixed parts never shrink or get cut: the ticket number, the status pill, the step dots, the `fix n/3` and `review n/3` chips, the tokens, and any tag. Only the text beside them gives way. The chat rows still wrap in full.
- **Live rows in the chat where you started the run**: a header row that updates in place, one row per meaningful event, stuck rows with the same reply buttons and **Help me**, and a limit-wait row. The rows never reach the model.

The code reuses the designs of the board prototype (`prototype/paseo-board`: variant B v2 for the panel and variant C for the rows), but none of its code.
