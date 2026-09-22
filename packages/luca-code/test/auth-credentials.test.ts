import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { mkdirSync, readdirSync } from "node:fs";
import { chmod, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";

import {
  CredentialSchema,
  loadCredentials,
  saveCredentials,
  deleteCredentials,
  isExpired,
  needsRefresh,
} from "../src/auth/credentials";
import type { Credential } from "../src/auth/credentials";

const CRED_FILENAME = "luca-code-cred.json";

/** Build a valid credential fixture with overrides. */
function makeCred(overrides: Partial<Credential> = {}): Credential {
  const base: Credential = {
    type: "openai_account_oauth",
    method: "chatgpt_headless",
    access: "access-token-abc",
    refresh: "refresh-token-xyz",
    expires_at: Date.now() + 60 * 60 * 1000, // 1h from now
    account_id: "acct_123",
    id_token: "header.payload.sig",
  };
  return { ...base, ...overrides };
}

describe("CredentialSchema", () => {
  test("accepts a well-formed credential", () => {
    const cred = makeCred();
    const result = CredentialSchema.safeParse(cred);
    expect(result.success).toBe(true);
  });

  test("rejects the wrong type literal", () => {
    const result = CredentialSchema.safeParse({ ...makeCred(), type: "api_key" });
    expect(result.success).toBe(false);
  });

  test("rejects the wrong method literal", () => {
    const result = CredentialSchema.safeParse({ ...makeCred(), method: "browser" });
    expect(result.success).toBe(false);
  });

  test("rejects missing access token", () => {
    const { access: _omit, ...rest } = makeCred();
    const result = CredentialSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  test("rejects non-integer expires_at", () => {
    const result = CredentialSchema.safeParse({ ...makeCred(), expires_at: "not-a-number" });
    expect(result.success).toBe(false);
  });

  test("rejects a non-positive expires_at", () => {
    const result = CredentialSchema.safeParse({ ...makeCred(), expires_at: -1 });
    expect(result.success).toBe(false);
  });
});

describe("isExpired", () => {
  test("false when expiry is in the future", () => {
    const cred = makeCred({ expires_at: Date.now() + 10_000 });
    expect(isExpired(cred)).toBe(false);
  });

  test("true when expiry is in the past", () => {
    const cred = makeCred({ expires_at: Date.now() - 10_000 });
    expect(isExpired(cred)).toBe(true);
  });

  test("honours a positive skew (treats near-future as expired)", () => {
    const now = Date.now();
    const cred = makeCred({ expires_at: now + 5_000 });
    // 10s skew means anything expiring within 10s is "expired".
    expect(isExpired(cred, 10_000)).toBe(true);
  });

  test("honours a negative skew (grace period)", () => {
    const now = Date.now();
    const cred = makeCred({ expires_at: now - 2_000 });
    // -10s skew grants a 10s grace window — still valid.
    expect(isExpired(cred, -10_000)).toBe(false);
  });
});

describe("needsRefresh", () => {
  test("true when expiry is within the default 60s skew", () => {
    const cred = makeCred({ expires_at: Date.now() + 30_000 });
    expect(needsRefresh(cred)).toBe(true);
  });

  test("false when expiry is comfortably in the future", () => {
    const cred = makeCred({ expires_at: Date.now() + 5 * 60_000 });
    expect(needsRefresh(cred)).toBe(false);
  });

  test("true when already expired", () => {
    const cred = makeCred({ expires_at: Date.now() - 60_000 });
    expect(needsRefresh(cred)).toBe(true);
  });

  test("honours an explicit skewMs override", () => {
    const cred = makeCred({ expires_at: Date.now() + 120_000 });
    // 180s skew → expiry (120s) is within the window → refresh needed.
    expect(needsRefresh(cred, 180_000)).toBe(true);
    // 60s skew → expiry (120s) is outside the window → no refresh.
    expect(needsRefresh(cred, 60_000)).toBe(false);
  });
});

describe("credential file I/O", () => {
  let profileDir: string;

  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "luca-code-cred-"));
  });

  afterEach(async () => {
    await rm(profileDir, { recursive: true, force: true });
  });

  test("saveCredentials writes 0o600 and loadCredentials round-trips", async () => {
    const cred = makeCred();
    await saveCredentials(profileDir, cred);

    const file = join(profileDir, CRED_FILENAME);
    const st = await stat(file);
    // POSIX mode 0o600 → owner rw only (mask 0o777).
    expect(st.mode & 0o777).toBe(0o600);

    const loaded = await loadCredentials(profileDir);
    expect(loaded).not.toBeNull();
    expect(loaded).toEqual(cred);
  });

  test("loadCredentials returns null when no file exists", async () => {
    const loaded = await loadCredentials(profileDir);
    expect(loaded).toBeNull();
  });

  test("loadCredentials returns null when the file is invalid JSON", async () => {
    const { writeFileSync, chmodSync } = await import("node:fs");
    const file = join(profileDir, CRED_FILENAME);
    writeFileSync(file, "{ not valid json");
    chmodSync(file, 0o600);
    const loaded = await loadCredentials(profileDir);
    expect(loaded).toBeNull();
  });

  test("loadCredentials returns null when the file fails schema validation", async () => {
    const { writeFileSync, chmodSync } = await import("node:fs");
    const file = join(profileDir, CRED_FILENAME);
    // Wrong type literal → schema rejects.
    writeFileSync(file, JSON.stringify({ ...makeCred(), type: "api_key" }));
    chmodSync(file, 0o600);
    const loaded = await loadCredentials(profileDir);
    expect(loaded).toBeNull();
  });

  test("saveCredentials overwrites an existing file atomically", async () => {
    const first = makeCred({ access: "first-access" });
    const second = makeCred({ access: "second-access" });
    await saveCredentials(profileDir, first);
    await saveCredentials(profileDir, second);
    const loaded = await loadCredentials(profileDir);
    expect(loaded?.access).toBe("second-access");
  });

  test("deleteCredentials removes the file", async () => {
    const cred = makeCred();
    await saveCredentials(profileDir, cred);
    await deleteCredentials(profileDir);
    const loaded = await loadCredentials(profileDir);
    expect(loaded).toBeNull();
  });

  test("deleteCredentials is a no-op when the file is absent", async () => {
    await expect(deleteCredentials(profileDir)).resolves.toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* #7 — secure persistence + clean-machine login                              */
/* -------------------------------------------------------------------------- */

describe("saveCredentials — secure persistence", () => {
  let profileDir: string;

  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "luca-code-secure-"));
  });

  afterEach(async () => {
    await chmod(profileDir, 0o700).catch(() => {});
    await rm(profileDir, { recursive: true, force: true });
  });

  test("creates a missing profile directory with mode 0o700", async () => {
    // Clean-machine path: the profile dir does not exist yet. Bun.write would
    // implicitly mkdir it at 0o755, leaving the token file world-traversable.
    const fresh = join(profileDir, "nested", "luca-code");
    await saveCredentials(fresh, makeCred());

    const dirStat = await stat(fresh);
    expect(dirStat.mode & 0o777).toBe(0o700);

    const fileStat = await stat(join(fresh, CRED_FILENAME));
    expect(fileStat.mode & 0o777).toBe(0o600);

    // And the credential must still round-trip out of the new directory.
    expect((await loadCredentials(fresh))?.access).toBe("access-token-abc");
  });

  test("tightens a PRE-EXISTING world-traversable profile directory to 0o700", async () => {
    // The upgrade path from a version that let Bun.write implicitly mkdir the
    // profile dir at 0o755: mkdir({mode:0o700}) is a no-op on a dir that
    // already exists, so without the unconditional chmod the 0o600 plaintext
    // token file stays reachable through a world-traversable parent forever.
    // This is the ONLY assertion that pins `chmod(profileDir, PROFILE_DIR_MODE)`
    // — mkdtemp already hands back a 0o700 dir, so the fresh-dir test above
    // passes with the chmod deleted.
    await chmod(profileDir, 0o755);
    expect((await stat(profileDir)).mode & 0o777).toBe(0o755);

    await saveCredentials(profileDir, makeCred());

    expect((await stat(profileDir)).mode & 0o777).toBe(0o700);
    expect((await stat(join(profileDir, CRED_FILENAME))).mode & 0o777).toBe(0o600);
  });

  test("rejects a credential that fails schema validation and writes nothing", async () => {
    // credentialFromTokens sets id_token:"" when the token response omits it;
    // CredentialSchema requires min(1), so loadCredentials could never read it
    // back. Persisting it is a silent, unrecoverable save.
    const bad = { ...makeCred(), id_token: "" } as Credential;
    await expect(saveCredentials(profileDir, bad)).rejects.toThrow(/credential/i);
    expect(await loadCredentials(profileDir)).toBeNull();
    expect(readdirSync(profileDir)).toEqual([]);
  });

  test("a rejected save preserves the previously stored credential", async () => {
    await saveCredentials(profileDir, makeCred({ access: "good" }));
    const bad = { ...makeCred(), account_id: "" } as Credential;
    await expect(saveCredentials(profileDir, bad)).rejects.toThrow(/credential/i);
    expect((await loadCredentials(profileDir))?.access).toBe("good");
  });

  test("leaves no plaintext temp file behind when the rename fails", async () => {
    // Make the rename target a non-empty directory so rename() throws after
    // the temp file (holding both tokens) has already been written.
    mkdirSync(join(profileDir, CRED_FILENAME));
    mkdirSync(join(profileDir, CRED_FILENAME, "child"));

    await expect(saveCredentials(profileDir, makeCred())).rejects.toThrow();

    const residue = readdirSync(profileDir).filter((n) => n.includes(".tmp-"));
    expect(residue).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* #13 — truthful logout deletion failures                                    */
/* -------------------------------------------------------------------------- */

describe("deleteCredentials — failure reporting", () => {
  let profileDir: string;

  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "luca-code-del-"));
  });

  afterEach(async () => {
    await chmod(profileDir, 0o700).catch(() => {});
    await rm(profileDir, { recursive: true, force: true });
  });

  test("rethrows the unlink failure when the credential path is a directory", async () => {
    // The PROPERTY under test is "the real errno survives, and ENOENT (the one
    // code deleteCredentials swallows) is never what a caller sees". The errno
    // itself is platform-dependent — macOS unlink(2) on a directory gives
    // EPERM, Linux gives EISDIR — so pinning one value would fail on a correct
    // implementation running on the other platform.
    mkdirSync(join(profileDir, CRED_FILENAME));
    let code: unknown;
    await expect(
      deleteCredentials(profileDir).catch((err: unknown) => {
        code = (err as { code?: unknown }).code;
        throw err;
      }),
    ).rejects.toThrow();
    expect(typeof code).toBe("string");
    expect(code).not.toBe("ENOENT");
    expect(["EPERM", "EISDIR"]).toContain(code as string);
  });

  test("rethrows EACCES when the profile directory is not writable", async () => {
    // root ignores the directory write bit, so the unlink simply succeeds and
    // there is no failure to report. Skip rather than assert the opposite.
    if (process.getuid?.() === 0) return;
    await saveCredentials(profileDir, makeCred());
    await chmod(profileDir, 0o500);
    let code: unknown;
    try {
      await expect(
        deleteCredentials(profileDir).catch((err: unknown) => {
          code = (err as { code?: unknown }).code;
          throw err;
        }),
      ).rejects.toThrow();
    } finally {
      await chmod(profileDir, 0o700);
    }
    expect(code).toBe("EACCES");
  });
});