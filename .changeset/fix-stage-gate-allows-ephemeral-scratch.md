---
"@alecsibilia/luca": patch
---

Stage-gate: allow inert ephemeral scratch writes in any pipeline step.

The stage-gate hook classified every `Write` as either a `.luca/` artifact
or project `code`, so a skill writing an out-of-band preview (e.g.
`decision-visualizer`'s self-contained HTML page) was blocked as
`code-write` whenever the pipeline was parked at a gated step:

```
stage-gate BLOCK: Write (category=code-write) is not allowed in
phase=REVIEWING (pipelineStep=learn)
```

Worse, macOS `mktemp` returns a path under `/var/folders/…`, which the
`/var` system-dir rule hard-denied in *every* phase.

This adds a first-class `ephemeral` write class for writes that touch
neither the repo tree nor pipeline state, allowed in any `pipelineStep`
(the phase/tool matrix is bypassed for this class):

- **OS temp dirs** — the universal `/tmp` and `/private/tmp`, plus the
  platform temp root supplied via `os.tmpdir()` / `$TMPDIR`, so macOS
  `/var/folders/…/T` is recognised *before* the `/var` denial.
- **`.luca/tmp/previews/<name>.<ext>`** — a sanctioned, gitignored in-repo
  preview location (new `tmp.preview` contract kind) so previews render
  mid-pipeline and persist for the session.

Security floor preserved: the legacy `/tmp/luca-*` collision denial is
checked first; non-temp `/var` paths, `.git/`, `~/.claude/`, `~/.luca/`,
and system dirs stay denied; and only the structured `Write`/`Edit` tools
get the bypass — Bash mutations remain phase-gated.
