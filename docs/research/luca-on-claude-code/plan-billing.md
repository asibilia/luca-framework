# Which ways of running Claude Code and Codex use the plan, not per-token billing?

> Research for wayfinder ticket [#345](https://github.com/asibilia/luca-framework/issues/345) on the map "Luca v1 on Paseo + Claude Code" (#325).
> Date: 2026-09-22. Checked: Claude Code 2.1.280 (`claude --version`), Paseo v0.9.1, Pi 0.87.0 (`@earendil-works/pi-coding-agent`). Codex CLI is not installed on this machine (`codex: command not found`).
>
> **DRAFT, work in progress.** Sections marked TODO are not done yet.

## Answer

TODO (short answer first).

Early findings, all checked against the live pages today:

- **Today, Claude Code in every form draws from the plan.** Anthropic's own help article says: "For now, nothing has changed: Claude Agent SDK, `claude -p`, and third-party app usage still draw from your subscription's usage limits" ([support.claude.com/…/15036540](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan), updated 2026-06-16). A planned June 15, 2026 switch, which would have moved `claude -p` and the Agent SDK off the plan and onto a monthly credit, is paused.
- **"Third-party harness" means a non-Anthropic app that talks to Anthropic with your plan login.** The Pi warning is Pi's own wording (Pi 0.87.0, `dist/modes/interactive/interactive-mode.js:140`). The Anthropic rule behind it is in the help article "Log in to your Claude account": Anthropic "reserves the right to draw use of such third-party tools from usage credits rather than subscription limits" ([support.claude.com/…/13189465](https://support.claude.com/en/articles/13189465-log-in-to-your-claude-account), updated 2026-05-19).
- **Paseo runs the real Claude Code binary, and the legal page allows that.** "Nor does it prevent an end user from signing in to the unmodified Claude Code binary with their own Claude subscription, including where a platform hosts Claude Code" ([code.claude.com/docs/en/legal-and-compliance](https://code.claude.com/docs/en/legal-and-compliance)).

## Findings

TODO

## What this means for the engine

TODO

## Unknowns and experiments to run later

TODO

## Sources

TODO
