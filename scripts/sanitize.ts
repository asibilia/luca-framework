#!/usr/bin/env bun

/**
 * Thin re-export shim for sanitize utilities.
 *
 * The canonical implementation lives in
 * `packages/luca-framework/src/utils/sanitize.ts`.
 * This shim exists so build scripts (build-deploy.ts) can import without
 * referencing the deep package path directly. If the package file moves,
 * update the import path below.
 *
 * Both build scripts and the `luca init` command share the same canonical
 * implementation through this indirection.
 *
 * @module sanitize
 */

export {
  sanitizeJsonParse,
  safeSanitizeJsonParse,
} from "../packages/luca-framework/src/utils/sanitize";
