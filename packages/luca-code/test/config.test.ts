import { test, expect, describe } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  CLIENT_ID,
  ISSUER,
  DEVICE_URL,
  DEVICE_USER_CODE_URL,
  DEVICE_TOKEN_URL,
  TOKEN_ENDPOINT,
  RESPONSES_ENDPOINT,
  MODELS_ENDPOINT,
  DEVICE_CALLBACK_URL,
  CLIENT_VERSION,
  REFRESH_SKEW_MS,
  POLL_SAFETY_MS,
} from "../src/constants";
import {
  ConfigSchema,
  loadConfig,
  defaultProfileDir,
  CODEX_CLI_RS_UA,
  DEFAULT_UA,
} from "../src/config";
import type { Config } from "../src/config";

describe("constants (verbatim from macaz auth.go)", () => {
  test("client_id and issuer", () => {
    expect(CLIENT_ID).toBe("app_EMoamEEZ73f0CkXaXp7hrann");
    expect(ISSUER).toBe("https://auth.openai.com");
  });

  test("device URLs are issuer-derived", () => {
    expect(DEVICE_URL).toBe(`${ISSUER}/codex/device`);
    expect(DEVICE_USER_CODE_URL).toBe(`${ISSUER}/api/accounts/deviceauth/usercode`);
    expect(DEVICE_TOKEN_URL).toBe(`${ISSUER}/api/accounts/deviceauth/token`);
    expect(TOKEN_ENDPOINT).toBe(`${ISSUER}/oauth/token`);
    expect(DEVICE_CALLBACK_URL).toBe(`${ISSUER}/deviceauth/callback`);
  });

  test("codex backend endpoints", () => {
    expect(RESPONSES_ENDPOINT).toBe("https://chatgpt.com/backend-api/codex/responses");
    expect(MODELS_ENDPOINT).toBe("https://chatgpt.com/backend-api/codex/models");
  });

  test("client version", () => {
    expect(CLIENT_VERSION).toBe("0.144.5");
  });

  test("timing skew/safety are expressed in ms", () => {
    expect(REFRESH_SKEW_MS).toBe(60_000);
    expect(POLL_SAFETY_MS).toBe(3_000);
  });
});

describe("defaultProfileDir", () => {
  test("resolves under a platform-appropriate home and names the app dir", () => {
    const dir = defaultProfileDir();
    expect(typeof dir).toBe("string");
    expect(dir.length).toBeGreaterThan(0);
    // The profile directory name must appear as a trailing segment.
    expect(dir.endsWith("luca-code")).toBe(true);
    // It must be rooted under the home directory on POSIX.
    expect(dir.startsWith(homedir())).toBe(true);
  });
});

describe("ConfigSchema defaults", () => {
  const defaults = ConfigSchema.parse({});

  test("defaultEffort is medium", () => {
    expect(defaults.defaultEffort).toBe("medium");
  });

  test("maxConcurrentSubscription is 4", () => {
    expect(defaults.maxConcurrentSubscription).toBe(4);
  });

  test("modelMap defaults to an empty object", () => {
    expect(defaults.modelMap).toEqual({});
  });

  test("maxBodyBytes is a positive integer", () => {
    expect(Number.isInteger(defaults.maxBodyBytes)).toBe(true);
    expect(defaults.maxBodyBytes).toBeGreaterThan(0);
  });

  test("requestTimeoutSec and requestTimeout are consistent (ms = sec*1000)", () => {
    expect(defaults.requestTimeoutSec).toBeGreaterThan(0);
    expect(defaults.requestTimeout).toBe(defaults.requestTimeoutSec * 1000);
  });

  test("originator defaults to cc-openai-bridge and codex_cli_rs UA toggle is off", () => {
    expect(defaults.originator).toBe("cc-openai-bridge");
    expect(defaults.useCodexCliRsUa).toBe(false);
  });

  test("profileDir default points at the platform home dir", () => {
    expect(defaults.profileDir).toBe(defaultProfileDir());
  });
});

describe("UA strings", () => {
  test("DEFAULT_UA carries the originator and client version", () => {
    expect(DEFAULT_UA).toContain("cc-openai-bridge");
    expect(DEFAULT_UA).toContain(CLIENT_VERSION);
  });

  test("CODEX_CLI_RS_UA matches the codex_cli_rs user-agent shape", () => {
    expect(CODEX_CLI_RS_UA).toContain("codex_cli_rs");
    expect(CODEX_CLI_RS_UA).toContain(CLIENT_VERSION);
  });
});

describe("loadConfig", () => {
  test("returns schema defaults when no env is provided", () => {
    const cfg = loadConfig({});
    expect(cfg.defaultEffort).toBe("medium");
    expect(cfg.maxConcurrentSubscription).toBe(4);
    expect(cfg.modelMap).toEqual({});
    expect(cfg.originator).toBe("cc-openai-bridge");
    expect(cfg.useCodexCliRsUa).toBe(false);
  });

  test("applies LUCA_CODE_* env overrides", () => {
    const cfg = loadConfig({
      LUCA_CODE_DEFAULT_EFFORT: "high",
      LUCA_CODE_MAX_CONCURRENT_SUBSCRIPTION: "8",
      LUCA_CODE_MAX_BODY_BYTES: "5242880",
      LUCA_CODE_REQUEST_TIMEOUT_SEC: "60",
      LUCA_CODE_ORIGINATOR: "my-bridge",
      LUCA_CODE_USE_CODEX_UA: "true",
      LUCA_CODE_PROFILE_DIR: join(homedir(), "custom-luca-code-dir"),
    });
    expect(cfg.defaultEffort).toBe("high");
    expect(cfg.maxConcurrentSubscription).toBe(8);
    expect(cfg.maxBodyBytes).toBe(5_242_880);
    expect(cfg.requestTimeoutSec).toBe(60);
    // requestTimeout (ms) is DERIVED from requestTimeoutSec unless the explicit
    // millisecond override is supplied.
    expect(cfg.requestTimeout).toBe(60_000);
    expect(cfg.originator).toBe("my-bridge");
    expect(cfg.useCodexCliRsUa).toBe(true);
    expect(cfg.profileDir).toBe(join(homedir(), "custom-luca-code-dir"));
  });

  test("derives requestTimeout (ms) from LUCA_CODE_REQUEST_TIMEOUT_SEC", () => {
    const cfg = loadConfig({ LUCA_CODE_REQUEST_TIMEOUT_SEC: "60" });
    expect(cfg.requestTimeoutSec).toBe(60);
    expect(cfg.requestTimeout).toBe(60_000);
  });

  test("explicit LUCA_CODE_REQUEST_TIMEOUT_MS wins over the derived seconds value", () => {
    const cfg = loadConfig({
      LUCA_CODE_REQUEST_TIMEOUT_SEC: "60",
      LUCA_CODE_REQUEST_TIMEOUT_MS: "5000",
    });
    expect(cfg.requestTimeoutSec).toBe(60);
    expect(cfg.requestTimeout).toBe(5000);
  });

  test("LUCA_CODE_REQUEST_TIMEOUT_MS alone leaves requestTimeoutSec at its default", () => {
    const cfg = loadConfig({ LUCA_CODE_REQUEST_TIMEOUT_MS: "5000" });
    expect(cfg.requestTimeout).toBe(5000);
    expect(cfg.requestTimeoutSec).toBe(120);
  });

  test("an invalid LUCA_CODE_REQUEST_TIMEOUT_SEC falls back to consistent defaults", () => {
    const cfg = loadConfig({ LUCA_CODE_REQUEST_TIMEOUT_SEC: "-5" });
    expect(cfg.requestTimeoutSec).toBe(120);
    expect(cfg.requestTimeout).toBe(120_000);
  });

  test("falls back to defaults when env values are invalid (safeParse)", () => {
    const cfg = loadConfig({
      LUCA_CODE_DEFAULT_EFFORT: "bogus-effort",
      LUCA_CODE_MAX_CONCURRENT_SUBSCRIPTION: "not-a-number",
      LUCA_CODE_MAX_BODY_BYTES: "-50",
    });
    expect(cfg.defaultEffort).toBe("medium");
    expect(cfg.maxConcurrentSubscription).toBe(4);
    expect(cfg.maxBodyBytes).toBe(ConfigSchema.parse({}).maxBodyBytes);
  });

  test("returns a Config-shaped object", () => {
    const cfg: Config = loadConfig({});
    expect(typeof cfg).toBe("object");
    expect(cfg).not.toBeNull();
  });

  test("uses Bun.env as the default env source", () => {
    // Calling loadConfig with zero arguments must not throw; it should read Bun.env.
    const cfg = loadConfig();
    expect(cfg).toBeDefined();
    expect(cfg.defaultEffort).toMatch(/^(low|medium|high)$/);
  });

  test("LUCA_CODE_USE_CODEX_UA accepts various truthy/falsy strings", () => {
    expect(loadConfig({ LUCA_CODE_USE_CODEX_UA: "1" }).useCodexCliRsUa).toBe(true);
    expect(loadConfig({ LUCA_CODE_USE_CODEX_UA: "false" }).useCodexCliRsUa).toBe(false);
    expect(loadConfig({ LUCA_CODE_USE_CODEX_UA: "0" }).useCodexCliRsUa).toBe(false);
  });
});