#!/usr/bin/env bun

/**
 * Thin re-export shim for branding utilities.
 *
 * The canonical implementation lives in
 * `packages/luca-framework/src/utils/branding.ts`.
 * This shim exists so build scripts (build-deploy.ts) can import without
 * referencing the deep package path directly. If the package file moves,
 * update the import path below.
 *
 * Both build scripts and the `luca init` command share the same canonical
 * implementation through this indirection.
 *
 * @module branding
 */

export {
  defaultBranding,
  validateBranding,
  validateBrandingField,
} from "../packages/luca-framework/src/utils/branding";

export type { BrandingConfig } from "../packages/luca-framework/src/types";
