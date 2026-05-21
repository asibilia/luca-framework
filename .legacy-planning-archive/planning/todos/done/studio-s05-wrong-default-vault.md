---
title: "Studio S-05: Wrong default vault on Sessions page"
area: ui
created: 2026-03-31
source: docs/archive/studio-review/studio/02-sessions.md
severity: medium
---

## Context

Studio Sessions page defaults to the wrong vault, showing data from a different vault than expected.

## Task

Fix the default vault selection to use the repo vault from config (or "default" as fallback).
