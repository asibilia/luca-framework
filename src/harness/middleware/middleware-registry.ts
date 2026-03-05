/**
 * Middleware registry for the harness verification pipeline.
 *
 * Maps middleware names (used in CheckMiddlewareConfig.name) to their
 * factory functions. Follows the same registry pattern used by
 * src/harness/parsers/parser-registry.ts.
 */

import type { CheckMiddleware } from "~/harness/__schemas/harness.schemas";

import { createTimingMiddleware } from "./timing";
import { createWorkspaceScopeMiddleware } from "./workspace-scope";
import { createOutputCaptureMiddleware } from "./output-capture";

export const middlewareRegistry: Record<string, () => CheckMiddleware> = {
  timing: createTimingMiddleware,
  "workspace-scope": createWorkspaceScopeMiddleware,
  "output-capture": createOutputCaptureMiddleware,
};

/**
 * Default middleware execution order.
 *
 * Timing wraps everything (outermost), workspace-scope provides context,
 * output-capture saves results (innermost, post-processing).
 */
export const DEFAULT_MIDDLEWARE_ORDER: string[] = [
  "timing",
  "workspace-scope",
  "output-capture",
];
