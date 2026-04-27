---
'@alecsibilia/luca-mastracode': patch
---

Workaround for upstream `mastracode@0.15.2` bug: long `ask_user` option labels crashed the TUI.

The inline `AskQuestionInlineComponent` does not wrap or truncate option labels, so any caller-supplied label wider than the bordered box's inner width tripped pi-tui's `Rendered line N exceeds terminal width` assertion in `doRender()` and killed the entire `luca run` process. The question text on the same component IS wrapped via `wrapTextWithAnsi`, so this is just a missing wrap step on the option labels (`chunk-YEHNNDZZ.js:88-99`).

After constructing `MastraTUI` we wrap `state.pendingAskUserComponents.set` so the first time mastracode registers a streaming `ask_user` instance we capture its constructor and monkey-patch `prototype.updateArgs` and `prototype.activate` to truncate any `option.label` whose visible width would overflow the current terminal (matching pi-tui's `cols - TERM_WIDTH_BUFFER(3) - box(4) - prefix(3) - headroom(1)` budget; appends `…`). Idempotent via `Symbol.for('luca.ask_user.label_truncate')`. Patch errors are logged but never block the question dialog.

Long labels now render visibly clipped instead of crashing the process. Tracked in #173 alongside any other upstream workarounds.
