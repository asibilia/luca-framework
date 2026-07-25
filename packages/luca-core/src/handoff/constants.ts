/**
 * Constants for the cross-repo handoff mailbox.
 *
 * The mailbox is machine-global (`~/.luca/handoff/`) and deliberately sits
 * inside a `HOME_DENIED_SUBDIRS` entry: agent `Write`/`Edit` tool calls into
 * `~/.luca/` are always denied by `classifyWritePath`, which forces every
 * envelope through the schema-validated CLI — exactly as `.luca/state.json`
 * is CLI-only. Do NOT weaken that deny list.
 */

/** Mailbox directory, relative to the caller-supplied homedir. */
export const HANDOFF_DIR_NAME = '.luca/handoff'

/**
 * Envelope schema version. A parsed envelope whose `schemaVersion` differs is
 * REJECTED with `reason: 'schema-version-mismatch'` rather than folded — a
 * silent default would paper over truncation the way `hasRequiredStateKeys`
 * exists to prevent.
 */
export const HANDOFF_SCHEMA_VERSION = 1

/**
 * Legal envelope-id charset. Shares the `RUN_ID_RE` shape deliberately: the id
 * is `<sanitized repoName>_<generateRunId()>` and becomes a FILENAME in a flat
 * machine-global directory, so anything outside this charset (`.`, `/`) is a
 * path-traversal vector and is rejected at both generation and consumption.
 */
export const ENVELOPE_ID_RE = /^[A-Za-z0-9_-]+$/

/**
 * Mailbox directory mode — owner-only. The mailbox is an UNAUTHENTICATED trust
 * boundary (any process running as this user can drop an envelope); `0o700` is
 * the only thing keeping other users off it.
 */
export const MAILBOX_DIR_MODE = 0o700
