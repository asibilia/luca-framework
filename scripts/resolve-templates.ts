#!/usr/bin/env bun

/**
 * resolve-templates.ts — Re-exports from the canonical package location.
 *
 * The core resolution logic lives in
 * `packages/luca-framework/src/utils/resolve-templates.ts` so that both
 * build scripts and the `luca init` command can import the same code.
 *
 * This file is a thin re-export shim that preserves backward compatibility
 * for existing imports from `scripts/resolve-templates`.
 *
 * @module resolve-templates
 */

export {
  resolveContent,
  resolvePathSegment,
  resolveFilePath,
  resolveTemplates,
} from "../packages/luca-framework/src/utils/resolve-templates";

export type { BrandingContext } from "../packages/luca-framework/src/utils/resolve-templates";
