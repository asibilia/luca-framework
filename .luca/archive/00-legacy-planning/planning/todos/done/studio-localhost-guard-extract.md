---
title: "Extract localhost guard into shared helper"
area: api
created: 2026-03-27
source: conversation
priority: P3
estimated_size: S
---

## Context

Phase 208 code review (code-simplifier, security-auditor) identified that the localhost host-header guard is copy-pasted across 4+ API routes (events, git/publish, git/revert, git/history). The security auditor also noted that Host header checking is easily spoofed.

## Task

1. Extract `isLocalhostRequest(request: Request): boolean` helper into `~/lib/request-guards.ts`
2. Replace the 6-line guard block in all routes with a single helper call
3. Consider upgrading to binding-level control (bind to 127.0.0.1 only) or a shared secret token

## Notes

- From Phase 208 code review: code-simplifier HIGH + security-auditor HIGH
- DRY violation + security concern (Host header spoofing)
- Also noted: SIDECAR_URL should move to `~/lib/constants.ts`
