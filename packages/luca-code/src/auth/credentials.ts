/**
 * auth/credentials.ts — persisted OAuth credential storage for luca-code.
 *
 * The credential is the only place the OpenAI access/refresh tokens live in
 * plaintext; it is stored on disk as `luca-code-cred.json` with a 0o600
 * mode (owner read/write only). All persistence is schema-first: a Zod
 * `CredentialSchema` owns the shape and validators, and `loadCredentials`
 * validates on read with `safeParse` so a corrupted or tampered file degrades
 * to `null` rather than crashing the proxy.
 *
 * Functional style throughout — no classes. Atomic writes use the
 * temp-file-then-rename pattern so a crash mid-write cannot leave a truncated
 * credential file behind.
 */

import { writeFileSync } from "node:fs";
import { chmod, mkdir, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

/** Filename holding the credential inside the profile directory. */
export const CREDENTIAL_FILENAME = "luca-code-cred.json";

/** File mode for the credential file and its temp sibling (owner rw only). */
const CRED_MODE = 0o600;

/** Directory mode for the profile dir (owner rwx only — not world-traversable). */
const PROFILE_DIR_MODE = 0o700;

/**
 * Zod schema owning the credential shape and validators. The single source
 * of truth for the `Credential` type via `z.infer`.
 *
 * `expires_at` is a positive integer expressed as a millisecond epoch (the
 * unit the runtime uses for `Date.now()` and timeout bookkeeping).
 */
export const CredentialSchema = z.object({
  type: z.literal("openai_account_oauth"),
  method: z.literal("chatgpt_headless"),
  access: z.string().min(1),
  refresh: z.string().min(1),
  expires_at: z.number().int().positive(),
  account_id: z.string().min(1),
  id_token: z.string().min(1),
});

/** Inferred credential shape — the only type callers should use. */
export type Credential = z.infer<typeof CredentialSchema>;

/** Resolve the on-disk path of the credential file inside a profile dir. */
function credPath(profileDir: string): string {
  return join(profileDir, CREDENTIAL_FILENAME);
}

/**
 * Read and validate the credential file.
 *
 * Returns `null` for any of: missing file, unreadable file, invalid JSON, or
 * schema-validation failure. The proxy never crashes on a corrupted
 * credential — it surfaces `null` and lets the caller re-run the device flow.
 */
export async function loadCredentials(profileDir: string): Promise<Credential | null> {
  let raw: string;
  try {
    raw = await Bun.file(credPath(profileDir)).text();
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = CredentialSchema.safeParse(parsed);
  if (!result.success) return null;
  return result.data;
}

/**
 * Atomically persist a credential to the profile directory with mode 0o600.
 *
 * The write is validated, private, and atomic — in that order:
 *
 *  1. `CredentialSchema.safeParse` gates the write. A credential that would
 *     fail `loadCredentials` (e.g. an empty `id_token`, which is what a token
 *     response with no id_token yields) is rejected BEFORE disk is touched, so
 *     a save can never succeed while leaving the store unreadable.
 *  2. The profile directory is created (recursively) at mode 0o700 and
 *     re-chmod'd when it already existed, so the plaintext token file is never
 *     reachable through a world-traversable parent.
 *  3. The temp sibling is created with mode 0o600 AT OPEN TIME (`writeFileSync`
 *     honours `mode`; `Bun.write` does not), so the tokens never exist on disk
 *     with a permissive mode — not even for the window before a post-hoc chmod.
 *  4. chmod + rename are wrapped so a failure unlinks the temp file rather than
 *     orphaning a plaintext copy of both tokens forever.
 *
 * On success the previous file (if any) is replaced atomically; on failure it
 * is left intact.
 */
export async function saveCredentials(profileDir: string, cred: Credential): Promise<void> {
  const validated = CredentialSchema.safeParse(cred);
  if (!validated.success) {
    throw new Error(`refusing to persist invalid credential — ${validated.error.message}`);
  }

  await mkdir(profileDir, { recursive: true, mode: PROFILE_DIR_MODE });
  // `mode` on mkdir only applies to directories it creates (and is masked by
  // umask); chmod unconditionally so a pre-existing loose dir is tightened.
  await chmod(profileDir, PROFILE_DIR_MODE);

  const finalPath = credPath(profileDir);
  const tempPath = `${finalPath}.tmp-${crypto.randomUUID()}`;
  writeFileSync(tempPath, JSON.stringify(validated.data), { mode: CRED_MODE });
  try {
    // Defence in depth: umask can mask the creation mode above.
    await chmod(tempPath, CRED_MODE);
    await rename(tempPath, finalPath);
    // Ensure the final file keeps the credential mode even if it pre-existed
    // with a looser mode (rename inherits the temp's mode, but be defensive).
    await chmod(finalPath, CRED_MODE);
  } catch (err) {
    // Never leave a plaintext access+refresh token pair behind.
    await unlink(tempPath).catch(() => {});
    throw err;
  }
}

/**
 * Remove the credential file (logout / rotation reset).
 *
 * ENOENT is swallowed so logout stays idempotent. EVERY other error (EACCES,
 * EPERM, EISDIR, EROFS, …) is rethrown UNCHANGED — including its `code` — so
 * the caller can report the failure truthfully. Reporting a successful logout
 * while the plaintext tokens are still on disk is the exact inverse of the
 * guarantee logout exists to provide.
 */
export async function deleteCredentials(profileDir: string): Promise<void> {
  try {
    await unlink(credPath(profileDir));
  } catch (err) {
    if (!isNotFoundError(err)) throw err;
  }
}

/**
 * True when the credential's access token has expired.
 *
 * `skewMs` shifts the comparison point: a positive skew treats tokens that
 * expire within the next `skewMs` as already expired (proactive refresh), a
 * negative skew grants a grace window past the recorded expiry.
 */
export function isExpired(cred: Credential, skewMs: number = 0): boolean {
  return Date.now() >= cred.expires_at - skewMs;
}

/**
 * True when the credential should be proactively refreshed. Defaults to a
 * 60s skew (`REFRESH_SKEW_MS`-equivalent) so the access token is rotated
 * before it actually expires.
 */
export function needsRefresh(cred: Credential, skewMs: number = 60_000): boolean {
  return isExpired(cred, skewMs);
}

/* -------------------------------------------------------------------------- */
/* tiny fs helpers — keep node:fs surface minimal and importable here only.  */
/* -------------------------------------------------------------------------- */

function isNotFoundError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err &&
    (err as { code?: unknown }).code === "ENOENT";
}