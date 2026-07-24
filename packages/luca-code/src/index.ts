/**
 * luca-code — package entrypoint.
 *
 * Re-exports the public surface as it is built across the 18-step plan.
 * Consumers (and the CLI) import from here so internal module layout can
 * shift without breaking callers.
 */

export { VERSION } from "./cli.js";

/**
 * Programmatic CLI entry — drives the same flows as the `luca-code` bin.
 *
 * `main(["claude", ...args])` runs the full gateway + launch flow (credential
 * check, subscription model fetch, loopback gateway, isolated Claude profile,
 * `claude` spawn, teardown) and resolves to a process exit code. The `luca code
 * --openai` command delegates here so it reuses the entire existing path.
 */
export { main, createDeps } from "./cli.js";
export type { CliDeps } from "./cli.js";