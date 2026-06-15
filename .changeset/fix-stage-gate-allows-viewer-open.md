---
"@alecsibilia/luca": patch
---

Stage-gate: classify desktop viewer-open launchers (`open`, `xdg-open`,
`start`) as read-only so they're allowed in gated pipeline steps.

Follow-up to the ephemeral-scratch fix. Writing a preview to
`.luca/tmp/previews/<name>.html` now works mid-pipeline, but the natural
next step — opening it in a browser — still failed:

```
The browser-open is blocked by the Luca stage-gate (we're parked at
learn, which disallows shell side-effects)
```

`open <path>` hands a file (or URL) to the OS default handler for display;
it mutates no files and no repo/pipeline state, so it belongs in the
read-only command set alongside `cat`/`ls` — not the unknown-command →
`bash-mutate` fallback that the matrix blocks in REVIEWING/FINALIZING.

A skill can now render AND open its page without the `!` shell escape.
Git-mutating and file-writing commands remain phase-gated.
