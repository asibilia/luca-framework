---
id: "106-01"
title: "Modernize Next.js config for luca-observer"
phase: 106
wave: 1
complexity: SIMPLE
depends_on: []
tasks:
  - id: "106-01-1"
    title: "Update next.config.ts with security headers and modern settings"
    goal: "Modernize next.config.ts following joes-book--next patterns: add security headers, remove redundant reactStrictMode, add output standalone mode"
    verify: "next.config.ts has security headers, output: 'standalone'; bunx --bun tsc --noEmit passes; dev server starts"
  - id: "106-01-2"
    title: "Verify build and dev server work with updated config"
    goal: "Confirm Next.js build and dev server start successfully with the new configuration"
    verify: "bunx --bun tsc --noEmit passes; no regressions in test suite"
---

# 106-01: Modernize Next.js Config

## Goal

Update luca-observer's Next.js config to modern conventions, aligning with the joes-book--next reference repo and Next.js 15 best practices.

## Context

@packages/luca-observer/next.config.ts -- Current minimal config (reactStrictMode only)

**Reference repo (joes-book--next) config includes:**

- Security headers (X-Frame-Options, X-Content-Type-Options, HSTS, etc.)
- Image remote patterns (app-specific, not needed for observer)
- API rewrites (app-specific, not needed for observer)

**Current state:**

- next.config.ts has only `reactStrictMode: true` (redundant in Next.js 15)
- No security headers
- No standalone output mode

## Tasks

### Task 106-01-1: Update next.config.ts

1. Remove redundant `reactStrictMode: true` (default since Next.js 13.4)
2. Add security headers from reference repo
3. Add `output: 'standalone'` for production-ready builds

### Task 106-01-2: Verify

1. `bunx --bun tsc --noEmit` passes
2. `bun test` passes
