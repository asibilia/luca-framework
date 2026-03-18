#!/usr/bin/env bun

/**
 * Thin re-export shim for resolve-templates.
 *
 * The canonical implementation lives in
 * `packages/luca-framework/src/utils/resolve-templates.ts`.
 * This shim exists so build scripts (build-deploy.ts) can import without
 * referencing the deep package path directly. If the package file moves,
 * update the import path below.
 *
 * Both build scripts and the `luca init` command share the same canonical
 * implementation through this indirection.
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
