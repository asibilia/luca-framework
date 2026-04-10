---
title: "Audit plan mode session_ledger: '*' — full write access in "read-only" mode"
area: permissions
created: 2026-04-10
priority: low
source: research
---

## Task

Audit plan mode session_ledger: '*' — full write access in "read-only" mode

## Context

`plan` mode is described as "read-only exploration" but has `session_ledger: '*'` granting full write access to the audit ledger. This may be intentional (plan mode may need to log events), but it's inconsistent with the read-only description. Should be reviewed for principle of least privilege.

## MuninnDB Recall

For full research context, search MuninnDB vault `luca-framework` for `research:mode-permission-matrix-audit`.
