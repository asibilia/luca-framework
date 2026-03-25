---
title: "Settings page (raw config, project identity, vault)"
area: ui
created: 2026-03-25
source: docs/brainstorm/observer-studio-rework
depends_on:
  [
    studio-w3-config-write-routes,
    studio-w4-layout-components,
    studio-w4-navigation-restructure,
  ]
phase: studio-w8
estimated_size: S
priority: P3
---

## Context

The Settings page is the "escape hatch" for advanced users who want to edit raw config.json, manage project identity, or configure MuninnDB vault settings. It lives in the CONFIGURE navigation group alongside the Config page.

## Task

Build the Settings page with sections for:

- **Raw Config Editor:** Full config.json displayed in a CodeMirror editor for direct JSON editing. Validates on save with `LuConfigSchema.safeParse()`. This is the escape hatch when structured forms don't expose a needed field.
- **Project Identity:** Display/edit project name, domain, and purpose from the brain tree (if MuninnDB is available)
- **Vault Configuration:** MuninnDB vault name, dual-vault routing preview, vault health summary

The page is intentionally minimal and targets advanced users. Most users will never visit it.

See `docs/brainstorm/observer-studio-rework/1.product-vision.md` (Proposed Navigation Structure, Settings entry) and `docs/brainstorm/observer-studio-rework/2.ux-design.md` for the escape hatch concept.

## Key Files

- New: `packages/luca-studio/app/settings/page.tsx`
- New: `packages/luca-studio/components/settings/raw-config-editor.tsx`
- New: `packages/luca-studio/components/settings/project-identity.tsx`
- New: `packages/luca-studio/components/settings/vault-config.tsx`

## Verification

- Settings page renders with all three sections
- Raw config editor loads config.json and validates on save
- Invalid JSON shows validation errors
- Successful save updates config.json atomically
- Page is accessible from CONFIGURE navigation group
