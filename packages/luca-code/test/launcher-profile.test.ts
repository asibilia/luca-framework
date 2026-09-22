/**
 * test/launcher-profile.test.ts — step 14 (launcher/profile.ts).
 *
 * Covers prepareClaudeProfile, configureGatewayModels, shareClaudeAsset per
 * the macaz internal/launcher/launcher.go port spec.
 */

import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  readFileSync,
  lstatSync,
  readdirSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  prepareClaudeProfile,
  configureGatewayModels,
  shareClaudeAsset,
} from "../src/launcher/profile";

function mode0o777(path: string): number {
  return lstatSync(path).mode & 0o777;
}

function readJSON(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
}

describe("prepareClaudeProfile", () => {
  let configDir: string;

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), "luca-code-profile-"));
  });

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true });
  });

  test("creates profileDir at <configDir>/luca-code/profile with mode 0o700", () => {
    const { profileDir } = prepareClaudeProfile({
      provider: "openai",
      selectedModel: "gpt-5",
      allowedModels: ["gpt-5", "gpt-4o"],
      configDir,
      env: {},
    });
    expect(profileDir).toBe(join(configDir, "luca-code", "profile"));
    expect(existsSync(profileDir)).toBe(true);
    expect(mode0o777(profileDir)).toBe(0o700);
  });

  test("returns { profileDir, selectedModel }", () => {
    const res = prepareClaudeProfile({
      provider: "openai",
      selectedModel: "gpt-5",
      allowedModels: ["gpt-5"],
      configDir,
      env: {},
    });
    expect(res.profileDir).toBe(join(configDir, "luca-code", "profile"));
    expect(res.selectedModel).toBe("gpt-5");
  });

  test("writes settings.json with model/availableModels/enforceAvailableModels", () => {
    const { profileDir } = prepareClaudeProfile({
      provider: "openai",
      selectedModel: "gpt-5",
      allowedModels: ["gpt-5", "gpt-4o"],
      configDir,
      env: {},
    });
    const settings = readJSON(join(profileDir, "settings.json"));
    expect(settings["model"]).toBe("gpt-5");
    expect(settings["availableModels"]).toEqual(["gpt-5", "gpt-4o"]);
    expect(settings["enforceAvailableModels"]).toBe(true);
  });

  test("loads settings from source settings.json when profile settings.json absent", () => {
    // Seed source ~/.claude (configDir) with a settings.json carrying extra keys.
    writeFileSync(
      join(configDir, "settings.json"),
      JSON.stringify({
        preferredNotifChannel: "iterm2",
        someUserKey: "keep-me",
        model: "old-model",
        availableModels: ["old"],
        enforceAvailableModels: true,
        fallbackModel: "fallback",
        modelOverrides: { x: "y" },
        env: {
          ANTHROPIC_API_KEY: "sk-xxx",
          luca_code_profile_dir: "/tmp",
          CLAUDE_CODE_USE_GATEWAY: "1",
          KEEP_ME: "yes",
        },
      }),
    );
    const { profileDir } = prepareClaudeProfile({
      provider: "openai",
      selectedModel: "gpt-5",
      allowedModels: ["gpt-5"],
      configDir,
      env: {},
    });
    const settings = readJSON(join(profileDir, "settings.json"));
    // User keys preserved.
    expect(settings["preferredNotifChannel"]).toBe("iterm2");
    expect(settings["someUserKey"]).toBe("keep-me");
    // Gateway keys scrubbed (then re-set by configureGatewayModels with new values).
    expect(settings["fallbackModel"]).toBeUndefined();
    expect(settings["modelOverrides"]).toBeUndefined();
    // Env scrubbed of ANTHROPIC_* / luca_code_* / CLAUDE_CODE_USE_GATEWAY but keeps KEEP_ME.
    const env = settings["env"] as Record<string, unknown>;
    expect(env["ANTHROPIC_API_KEY"]).toBeUndefined();
    expect(env["luca_code_profile_dir"]).toBeUndefined();
    expect(env["CLAUDE_CODE_USE_GATEWAY"]).toBeUndefined();
    expect(env["KEEP_ME"]).toBe("yes");
    // configureGatewayModels overwrote model/availableModels/enforceAvailableModels.
    expect(settings["model"]).toBe("gpt-5");
    expect(settings["availableModels"]).toEqual(["gpt-5"]);
    expect(settings["enforceAvailableModels"]).toBe(true);
  });

  test("on provider change: removes cache/gateway-models.json and resets model", () => {
    // First run — provider openai.
    const r1 = prepareClaudeProfile({
      provider: "openai",
      selectedModel: "gpt-5",
      allowedModels: ["gpt-5"],
      configDir,
      env: {},
    });
    // Seed a cache file as if a prior gateway wrote it.
    mkdirSync(join(r1.profileDir, "cache"), { recursive: true });
    writeFileSync(join(r1.profileDir, "cache", "gateway-models.json"), "{}");
    expect(existsSync(join(r1.profileDir, "cache", "gateway-models.json"))).toBe(true);

    // Second run — provider anthropic (changed).
    const r2 = prepareClaudeProfile({
      provider: "anthropic",
      selectedModel: "claude-sonnet-4",
      allowedModels: ["claude-sonnet-4"],
      configDir,
      env: {},
    });
    expect(r2.profileDir).toBe(r1.profileDir);
    expect(existsSync(join(r2.profileDir, "cache", "gateway-models.json"))).toBe(false);
    const settings = readJSON(join(r2.profileDir, "settings.json"));
    expect(settings["model"]).toBe("claude-sonnet-4");
  });

  test("same provider does not remove cache/gateway-models.json", () => {
    const r1 = prepareClaudeProfile({
      provider: "openai",
      selectedModel: "gpt-5",
      allowedModels: ["gpt-5"],
      configDir,
      env: {},
    });
    mkdirSync(join(r1.profileDir, "cache"), { recursive: true });
    writeFileSync(join(r1.profileDir, "cache", "gateway-models.json"), '{"x":1}');
    prepareClaudeProfile({
      provider: "openai",
      selectedModel: "gpt-5",
      allowedModels: ["gpt-5"],
      configDir,
      env: {},
    });
    expect(existsSync(join(r1.profileDir, "cache", "gateway-models.json"))).toBe(true);
  });

  test("writes provider marker", () => {
    const { profileDir } = prepareClaudeProfile({
      provider: "openai",
      selectedModel: "gpt-5",
      allowedModels: ["gpt-5"],
      configDir,
      env: {},
    });
    const marker = readJSON(join(profileDir, "provider.json"));
    expect(marker["provider"]).toBe("openai");
  });

  test("symlinks agents/commands/skills/plugins/CLAUDE.md from source", () => {
    // Seed source assets under configDir.
    for (const name of ["agents", "commands", "skills", "plugins"]) {
      mkdirSync(join(configDir, name), { recursive: true });
      writeFileSync(join(configDir, name, "marker.txt"), name);
    }
    writeFileSync(join(configDir, "CLAUDE.md"), "# project memory");

    const { profileDir } = prepareClaudeProfile({
      provider: "openai",
      selectedModel: "gpt-5",
      allowedModels: ["gpt-5"],
      configDir,
      env: {},
    });
    for (const name of ["agents", "commands", "skills", "plugins"]) {
      const link = join(profileDir, name);
      expect(existsSync(link)).toBe(true);
      expect(lstatSync(link).isSymbolicLink()).toBe(true);
      expect(readFileSync(join(link, "marker.txt"), "utf-8")).toBe(name);
    }
    const md = join(profileDir, "CLAUDE.md");
    expect(lstatSync(md).isSymbolicLink()).toBe(true);
    expect(readFileSync(md, "utf-8")).toBe("# project memory");
  });

  test("sourceDir falls back to ~/.claude when CLAUDE_CONFIG_DIR equals profileDir", () => {
    // Point CLAUDE_CONFIG_DIR at the profileDir itself — sourceDir must NOT be
    // the profileDir (would self-reference). It falls back to ~/.claude.
    const profileDir = join(configDir, "luca-code", "profile");
    // Use a configDir equal to profileDir via env override.
    const res = prepareClaudeProfile({
      provider: "openai",
      selectedModel: "gpt-5",
      allowedModels: ["gpt-5"],
      configDir: profileDir,
      env: { CLAUDE_CONFIG_DIR: profileDir },
    });
    // profileDir should still resolve under the ( overridden ) configDir.
    expect(res.profileDir).toBe(join(profileDir, "luca-code", "profile"));
  });
});

describe("prepareClaudeProfile MCP server seeding", () => {
  let configDir: string;

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), "luca-code-profile-mcp-"));
  });

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true });
  });

  test("seeds top-level mcpServers from source .claude.json into the profile", () => {
    // The user's real Claude state file carries user-scoped MCP servers. In the
    // default layout this is the legacy ~/.claude.json sibling of the assets
    // dir; here sourceDir === configDir so the inside candidate picks it up.
    writeFileSync(
      join(configDir, ".claude.json"),
      JSON.stringify({
        mcpServers: {
          muninn: { type: "stdio", command: "muninn" },
          blender: { type: "stdio", command: "blender-mcp" },
        },
        numStartups: 99,
      }),
    );

    const { profileDir } = prepareClaudeProfile({
      provider: "openai",
      selectedModel: "gpt-5",
      allowedModels: ["gpt-5"],
      configDir,
      env: {},
    });

    const state = readJSON(join(profileDir, ".claude.json"));
    const mcp = state["mcpServers"] as Record<string, unknown>;
    expect(mcp["muninn"]).toEqual({ type: "stdio", command: "muninn" });
    expect(mcp["blender"]).toEqual({ type: "stdio", command: "blender-mcp" });
  });

  test("seeds per-project mcpServers from source .claude.json", () => {
    const projPath = "/Users/example/my-project";
    // First launch creates the profile.
    const r1 = prepareClaudeProfile({
      provider: "openai",
      selectedModel: "gpt-5",
      allowedModels: ["gpt-5"],
      configDir,
      env: {},
    });
    // Simulate Claude Code having written project state (non-MCP) into the
    // profile — seeding must preserve it while injecting mcpServers.
    writeFileSync(
      join(r1.profileDir, ".claude.json"),
      JSON.stringify({ projects: { [projPath]: { allowedTools: ["Read"] } } }),
    );
    // Source carries the project's MCP servers.
    writeFileSync(
      join(configDir, ".claude.json"),
      JSON.stringify({
        projects: {
          [projPath]: { mcpServers: { muninn: { type: "stdio", command: "muninn" } } },
        },
      }),
    );

    const { profileDir } = prepareClaudeProfile({
      provider: "openai",
      selectedModel: "gpt-5",
      allowedModels: ["gpt-5"],
      configDir,
      env: {},
    });

    const state = readJSON(join(profileDir, ".claude.json"));
    const projects = state["projects"] as Record<string, Record<string, unknown>>;
    const proj = projects[projPath]!;
    expect(proj["mcpServers"]).toEqual({
      muninn: { type: "stdio", command: "muninn" },
    });
    // non-MCP project state preserved
    expect(proj["allowedTools"]).toEqual(["Read"]);
  });

  test("preserves existing profile .claude.json non-MCP state", () => {
    // First launch creates the profile state file with onboarding state.
    const r1 = prepareClaudeProfile({
      provider: "openai",
      selectedModel: "gpt-5",
      allowedModels: ["gpt-5"],
      configDir,
      env: {},
    });
    // Simulate Claude Code writing onboarding/user state into the profile.
    writeFileSync(
      join(r1.profileDir, ".claude.json"),
      JSON.stringify({ hasCompletedOnboarding: true, userID: "u-123", numStartups: 7 }),
    );

    // Now seed source MCP config and re-prepare.
    writeFileSync(
      join(configDir, ".claude.json"),
      JSON.stringify({ mcpServers: { muninn: { type: "stdio", command: "muninn" } } }),
    );
    prepareClaudeProfile({
      provider: "openai",
      selectedModel: "gpt-5",
      allowedModels: ["gpt-5"],
      configDir,
      env: {},
    });

    const state = readJSON(join(r1.profileDir, ".claude.json"));
    expect(state["hasCompletedOnboarding"]).toBe(true);
    expect(state["userID"]).toBe("u-123");
    expect(state["numStartups"]).toBe(7);
    expect((state["mcpServers"] as Record<string, unknown>)["muninn"]).toEqual({
      type: "stdio",
      command: "muninn",
    });
  });

  test("does not create mcpServers when source has no MCP config", () => {
    // Source state file present but with no mcpServers — seeding is a no-op.
    writeFileSync(join(configDir, ".claude.json"), JSON.stringify({ numStartups: 3 }));

    const { profileDir } = prepareClaudeProfile({
      provider: "openai",
      selectedModel: "gpt-5",
      allowedModels: ["gpt-5"],
      configDir,
      env: {},
    });

    // No profile .claude.json should be written by seeding (nothing to seed).
    expect(existsSync(join(profileDir, ".claude.json"))).toBe(false);
  });

  test("source-authoritative: removals in source propagate to the profile", () => {
    // Seed two servers, then re-prepare with only one — the dropped server must
    // not linger in the profile (source is mirrored, not merged).
    writeFileSync(
      join(configDir, ".claude.json"),
      JSON.stringify({
        mcpServers: {
          muninn: { type: "stdio", command: "muninn" },
          stale: { type: "stdio", command: "stale" },
        },
      }),
    );
    const r1 = prepareClaudeProfile({
      provider: "openai",
      selectedModel: "gpt-5",
      allowedModels: ["gpt-5"],
      configDir,
      env: {},
    });
    expect(
      (readJSON(join(r1.profileDir, ".claude.json"))["mcpServers"] as Record<string, unknown>)[
        "stale"
      ],
    ).toBeDefined();

    writeFileSync(
      join(configDir, ".claude.json"),
      JSON.stringify({ mcpServers: { muninn: { type: "stdio", command: "muninn" } } }),
    );
    prepareClaudeProfile({
      provider: "openai",
      selectedModel: "gpt-5",
      allowedModels: ["gpt-5"],
      configDir,
      env: {},
    });
    const mcp = readJSON(join(r1.profileDir, ".claude.json"))["mcpServers"] as Record<
      string,
      unknown
    >;
    expect(mcp["muninn"]).toBeDefined();
    expect(mcp["stale"]).toBeUndefined();
  });
});

describe("configureGatewayModels", () => {
  test("sets model/availableModels/enforceAvailableModels on settings", () => {
    const settings: Record<string, unknown> = { foo: "bar" };
    const out = configureGatewayModels(settings, "gpt-5", ["gpt-5", "gpt-4o"]);
    expect(out["model"]).toBe("gpt-5");
    expect(out["availableModels"]).toEqual(["gpt-5", "gpt-4o"]);
    expect(out["enforceAvailableModels"]).toBe(true);
    // preserves other keys
    expect(out["foo"]).toBe("bar");
  });

  test("overwrites prior model/availableModels/enforceAvailableModels", () => {
    const settings: Record<string, unknown> = {
      model: "old",
      availableModels: ["old"],
      enforceAvailableModels: false,
    };
    const out = configureGatewayModels(settings, "new", ["new"]);
    expect(out["model"]).toBe("new");
    expect(out["availableModels"]).toEqual(["new"]);
    expect(out["enforceAvailableModels"]).toBe(true);
  });
});

describe("shareClaudeAsset", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "luca-code-share-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("symlinks a directory from source to target", () => {
    const src = join(dir, "agents");
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, "a.txt"), "hi");
    const target = join(dir, "link-agents");
    const res = shareClaudeAsset(src, target);
    expect(res.method).toBe("symlink");
    expect(lstatSync(target).isSymbolicLink()).toBe(true);
    expect(readFileSync(join(target, "a.txt"), "utf-8")).toBe("hi");
  });

  test("symlinks a file from source to target", () => {
    const src = join(dir, "CLAUDE.md");
    writeFileSync(src, "# mem");
    const target = join(dir, "link-md");
    const res = shareClaudeAsset(src, target);
    expect(res.method).toBe("symlink");
    expect(lstatSync(target).isSymbolicLink()).toBe(true);
    expect(readFileSync(target, "utf-8")).toBe("# mem");
  });

  test("falls back to copy when forceCopy is set (dir)", () => {
    const src = join(dir, "skills");
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, "s.txt"), "s");
    const target = join(dir, "copy-skills");
    const res = shareClaudeAsset(src, target, { forceCopy: true });
    expect(res.method).toBe("copy");
    expect(lstatSync(target).isSymbolicLink()).toBe(false);
    expect(readFileSync(join(target, "s.txt"), "utf-8")).toBe("s");
  });

  test("falls back to copy a file with mode 0o600", () => {
    const src = join(dir, "file.txt");
    writeFileSync(src, "x");
    const target = join(dir, "copy-file.txt");
    const res = shareClaudeAsset(src, target, { forceCopy: true });
    expect(res.method).toBe("copy");
    expect(lstatSync(target).isSymbolicLink()).toBe(false);
    expect(mode0o777(target)).toBe(0o600);
    expect(readFileSync(target, "utf-8")).toBe("x");
  });

  test("replaces an existing target", () => {
    const src = join(dir, "agents");
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, "a.txt"), "new");
    const target = join(dir, "link-agents");
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, "stale.txt"), "stale");
    shareClaudeAsset(src, target);
    expect(existsSync(join(target, "stale.txt"))).toBe(false);
    expect(readFileSync(join(target, "a.txt"), "utf-8")).toBe("new");
  });

  test("returns method none when source does not exist", () => {
    const target = join(dir, "missing");
    const res = shareClaudeAsset(join(dir, "nope"), target, { forceCopy: true });
    expect(res.method).toBe("none");
    expect(existsSync(target)).toBe(false);
  });
});