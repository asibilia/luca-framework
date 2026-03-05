/**
 * Public API barrel for the harness middleware module.
 *
 * Re-exports only -- no logic, no registries, no constants.
 */

export {
  middlewareRegistry,
  DEFAULT_MIDDLEWARE_ORDER,
} from "./middleware-registry";
export { createTimingMiddleware } from "./timing";
export { createWorkspaceScopeMiddleware } from "./workspace-scope";
export { createOutputCaptureMiddleware } from "./output-capture";
