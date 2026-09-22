/**
 * test/cli.test.ts — step 16 (src/cli.ts entry).
 *
 * Covers the four commands (login, claude, status, logout) plus help/version
 * routing. All side effects (device flow, model fetch, gateway, profile
 * prep, claude launch, credential IO, console output) are injected via a
 * CliDeps object so the suite never touches the network, the disk credential
 * store, or a real `claude` binary.
 */

import { test, expect, describe } from "bun:test";

import {
  bindGenerateDependencies,
  productionGenerateDeps,
  main,
  VERSION,
  createDeps,
  type CliDeps,
} from "../src/cli";
import { CLIENT_VERSION } from "../src/constants";
import { CODEX_CLI_RS_UA, DEFAULT_UA, loadConfig } from "../src/config";
import {
  extractEmail as realExtractEmail,
  extractPlanType as realExtractPlanType,
} from "../src/auth/jwt";
import type { ForceRefreshOptions } from "../src/auth/openai-subscription";
import type { Credential } from "../src/auth/credentials";
import type { Model } from "../src/provider/models";
import type { Gateway, GatewayDeps } from "../src/gateway/server";
import type { GenerateDeps, GenerateOptions } from "../src/provider/openai";
import type { PrepareResult } from "../src/launcher/profile";

/* -------------------------------------------------------------------------- */
/* helpers                                                                    */
/* -------------------------------------------------------------------------- */

const PROFILE_DIR = "/tmp/luca-code-fake-profile";

/** Build a minimal valid Credential with a decodable id_token. */
function makeCred(over: Partial<Credential> = {}): Credential {
  // A trivially decodable JWT payload (header.payload.sig) carrying email +
  // plan claims. base64url of `{"email":"a@b.com","chatgpt_plan_type":"plus"}`
  // is "eyJlbWFpbCI6ImFAYi5jb20iLCJjaGF0Z3B0X3BsYW5fdHlwZSI6InBsdXMifQ".
  const payload = "eyJlbWFpbCI6ImFAYi5jb20iLCJjaGF0Z3B0X3BsYW5fdHlwZSI6InBsdXMifQ";
  const idToken = `header.${payload}.sig`;
  return {
    type: "openai_account_oauth",
    method: "chatgpt_headless",
    access: "access-AAA",
    refresh: "refresh-RRR",
    expires_at: Date.now() + 3_600_000,
    account_id: "acct_42",
    id_token: idToken,
    ...over,
  };
}

/** Minimal GenerateOptions payload for exercising a bound GenerateFn. */
function generateOptionsFixture(): GenerateOptions {
  return {
    req: {
      model: "claude-luca-code-gpt-5",
      max_tokens: 1,
      messages: [],
      system: null,
      tools: [],
      tool_choice: null,
      stop_sequences: [],
      stream: false,
      thinking: null,
      output_config: null,
      output_format: null,
      metadata: null,
    },
    emit: () => {},
    cred: makeCred(),
    model: "gpt-5",
    defaultEffort: "medium",
    maxConcurrent: 1,
  };
}

/** Build a minimal Model list. */
function makeModels(): Model[] {
  return [
    {
      id: "gpt-5",
      displayName: "GPT-5",
      description: "flagship",
      efforts: ["low", "medium", "high"],
      inputModalities: ["text", "image"],
      contextWindow: 200_000,
      toolCall: true,
      attachment: true,
      Default: true,
    },
    {
      id: "gpt-4o",
      displayName: "GPT-4o",
      description: "fast",
      efforts: ["medium"],
      inputModalities: ["text"],
      contextWindow: 128_000,
      toolCall: true,
      attachment: false,
      Default: false,
    },
  ];
}

/** Recording output sink. */
function recordingOutput(): { out: string[]; err: string[]; log: (m: string) => void; error: (m: string) => void } {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    log: (m: string) => void out.push(m),
    error: (m: string) => void err.push(m),
  };
}

/** Fake gateway with mutable lifecycle flags on the object itself. */
interface FakeGateway extends Gateway {
  started: boolean;
  closed: boolean;
  installed: Model[];
}

function fakeGateway(): FakeGateway {
  const gw: FakeGateway = {
    started: false,
    closed: false,
    installed: [],
    start: async () => {
      gw.started = true;
    },
    url: () => "http://127.0.0.1:9999",
    token: () => "deadbeef-token",
    close: () => {
      gw.closed = true;
    },
    installModels: (models: Model[]) => {
      gw.installed = [...models];
    },
    resolveModel: () => undefined,
    stats: () => ({ results: 0, failures: 0, totalInputTokens: 0, totalOutputTokens: 0 }),
  };
  return gw;
}

/** Recording harness exposing the mutable side-effect state. */
interface FakeHarness extends CliDeps {
  output: { out: string[]; err: string[]; log: (m: string) => void; error: (m: string) => void };
  savedCred: Credential | null;
  deletedProfileDir: string | null;
  gatewayRef: FakeGateway;
  launchCalledWith: Record<string, unknown> | null;
}

/** Build CliDeps with recording sinks + fake side effects. */
function fakeDeps(over: Partial<CliDeps> = {}): FakeHarness {
  const output = recordingOutput();
  const state = {
    savedCred: null as Credential | null,
    deletedProfileDir: null as string | null,
    launchCalledWith: null as Record<string, unknown> | null,
  };
  const gw = fakeGateway();
  const cred = makeCred();
  const harness: FakeHarness = {
    output,
    savedCred: state.savedCred,
    deletedProfileDir: state.deletedProfileDir,
    gatewayRef: gw,
    launchCalledWith: state.launchCalledWith,
    config: {
      profileDir: PROFILE_DIR,
      defaultEffort: "medium",
      maxConcurrentSubscription: 4,
      modelMap: {},
      maxBodyBytes: 10 * 1024 * 1024,
      requestTimeoutSec: 120,
      requestTimeout: 120_000,
      originator: "cc-openai-bridge",
      useCodexCliRsUa: false,
    },
    ua: "cc-openai-bridge/0.1.0",
    loadCred: async () => cred,
    saveCred: async (_dir: string, c: Credential) => {
      state.savedCred = c;
      harness.savedCred = c;
    },
    deleteCred: async (dir: string) => {
      state.deletedProfileDir = dir;
      harness.deletedProfileDir = dir;
    },
    authorize: async () => cred,
    fetchModels: async () => makeModels(),
    getCredential: async () => cred,
    forceRefresh: async () => cred,
    generate: async () => ({
      model: "gpt-5",
      blocks: [{ type: "text", text: "ok" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 1, output_tokens: 1 },
    }),
    countTokens: () => ({ count: 1, estimated: true }),
    createGateway: () => gw,
    prepareProfile: (rawOpts: unknown): PrepareResult => {
      const opts = rawOpts as { selectedModel: string };
      return { profileDir: "/tmp/luca-code-prepared-profile", selectedModel: opts.selectedModel };
    },
    launchClaude: async (rawOpts: unknown) => {
      const recorded = rawOpts as Record<string, unknown>;
      state.launchCalledWith = recorded;
      harness.launchCalledWith = recorded;
      return 0;
    },
    extractEmail: () => "a@b.com",
    extractPlan: () => "plus",
    log: output.log,
    error: output.error,
    ...over,
  };
  return harness;
}

/* -------------------------------------------------------------------------- */
/* help / version / unknown                                                    */
/* -------------------------------------------------------------------------- */

describe("cli — routing", () => {
  test("version command prints VERSION and exits 0", async () => {
    const deps = fakeDeps();
    const code = await main(["version"], deps);
    expect(code).toBe(0);
    expect(deps.output.out.join("\n")).toContain(VERSION);
  });

  test("--version flag prints VERSION and exits 0", async () => {
    const deps = fakeDeps();
    const code = await main(["--version"], deps);
    expect(code).toBe(0);
    expect(deps.output.out.join("\n")).toContain(VERSION);
  });

  test("help / --help / -h / empty argv print help with command list", async () => {
    for (const argv of [["help"], ["--help"], ["-h"], []] as string[][]) {
      const deps = fakeDeps();
      const code = await main(argv, deps);
      expect(code).toBe(0);
      const text = deps.output.out.join("\n");
      expect(text).toContain("luca-code");
      expect(text).toContain("login");
      expect(text).toContain("claude");
      expect(text).toContain("status");
      expect(text).toContain("logout");
    }
  });

  test("unknown command prints an error to stderr and exits 1", async () => {
    const deps = fakeDeps();
    const code = await main(["bogus"], deps);
    expect(code).toBe(1);
    expect(deps.output.err.join("\n").toLowerCase()).toContain("unknown");
    expect(deps.output.err.join("\n")).toContain("bogus");
  });
});

/* -------------------------------------------------------------------------- */
/* login                                                                       */
/* -------------------------------------------------------------------------- */

describe("cli — login", () => {
  test("runs device flow, persists credential, prints email + plan", async () => {
    const deps = fakeDeps();
    const code = await main(["login"], deps);
    expect(code).toBe(0);
    expect(deps.savedCred).not.toBeNull();
    expect(deps.savedCred?.access).toBe("access-AAA");
    const text = deps.output.out.join("\n");
    expect(text).toContain("a@b.com");
    expect(text.toLowerCase()).toContain("plus");
  });

  test("prints device-flow prompt before polling (ready callback)", async () => {
    let readySeen: { deviceURL: string; userCode: string } | null = null;
    const deps = fakeDeps({
      authorize: async (opts) => {
        const info = { deviceURL: "https://x", userCode: "ABC-123" };
        opts.ready(info);
        readySeen = info;
        return makeCred();
      },
    });
    await main(["login"], deps);
    // readySeen is populated because authorize invoked ready; the CLI prints it.
    expect(readySeen).not.toBeNull();
    expect(deps.output.out.join("\n")).toContain("ABC-123");
  });

  test("on authorize failure prints error and exits 1", async () => {
    const deps = fakeDeps({
      authorize: async () => {
        throw new Error("device flow rejected");
      },
    });
    const code = await main(["login"], deps);
    expect(code).toBe(1);
    expect(deps.output.err.join("\n").toLowerCase()).toContain("device flow rejected");
  });
});

/* -------------------------------------------------------------------------- */
/* claude                                                                      */
/* -------------------------------------------------------------------------- */

describe("cli — claude", () => {
  test("without a credential prints login hint and exits 1", async () => {
    const deps = fakeDeps({ loadCred: async () => null });
    const code = await main(["claude"], deps);
    expect(code).toBe(1);
    const text = deps.output.err.join("\n");
    expect(text).toContain("run luca-code login first");
  });

  test("fetches models, starts gateway, installs models, prepares profile, launches claude, closes gateway", async () => {
    const deps = fakeDeps();
    const code = await main(["claude", "--model", "sonnet", "-p", "hi"], deps);
    expect(code).toBe(0);

    // gateway started + models installed + closed.
    expect(deps.gatewayRef.closed).toBe(true);

    // launchClaude received gateway URL + token + public model ids.
    const launched = deps.launchCalledWith;
    expect(launched).not.toBeNull();
    expect(launched?.["baseUrl"]).toBe("http://127.0.0.1:9999");
    expect(launched?.["authToken"]).toBe("deadbeef-token");
    const models = launched?.["models"] as string[];
    expect(models.some((m) => m.startsWith("claude-luca-code-"))).toBe(true);
    expect(launched?.["selectedModel"]).toMatch(/^claude-luca-code-/);
    expect(launched?.["launchModel"]).toBe(launched?.["selectedModel"]);
    // user args forwarded.
    const args = launched?.["args"] as string[];
    expect(args).toContain("--model");
    expect(args).toContain("sonnet");
    expect(args).toContain("-p");
    expect(args).toContain("hi");
  });

  test("on launchClaude non-zero exit, still closes gateway and propagates code", async () => {
    const deps = fakeDeps({
      launchClaude: async () => 7,
    });
    const code = await main(["claude"], deps);
    expect(code).toBe(7);
    expect(deps.gatewayRef.closed).toBe(true);
  });

  test("on model fetch failure prints error and exits 1 (no gateway leak)", async () => {
    const deps = fakeDeps({
      fetchModels: async () => {
        throw new Error("upstream 503");
      },
    });
    const code = await main(["claude"], deps);
    expect(code).toBe(1);
    expect(deps.output.err.join("\n").toLowerCase()).toContain("upstream 503");
    // gateway was created but start was not reached -> still closed defensively
  });

  test("empty model list prints error and exits 1", async () => {
    const deps = fakeDeps({ fetchModels: async () => [] });
    const code = await main(["claude"], deps);
    expect(code).toBe(1);
    expect(deps.output.err.join("\n").toLowerCase()).toContain("model");
  });
});

/* -------------------------------------------------------------------------- */
/* status                                                                      */
/* -------------------------------------------------------------------------- */

describe("cli — status", () => {
  test("without a credential reports not connected", async () => {
    const deps = fakeDeps({ loadCred: async () => null });
    const code = await main(["status"], deps);
    expect(code).toBe(0);
    const text = deps.output.out.join("\n").toLowerCase();
    expect(text).toContain("not connected");
  });

  test("with a credential prints provider, email, plan, and model catalog", async () => {
    const deps = fakeDeps();
    const code = await main(["status"], deps);
    expect(code).toBe(0);
    const text = deps.output.out.join("\n");
    expect(text).toContain("openai");
    expect(text).toContain("a@b.com");
    expect(text.toLowerCase()).toContain("plus");
    // model catalog fetched + listed.
    expect(text).toContain("gpt-5");
  });

  test("an opaque (non-JWT) id_token degrades to <unknown> instead of crashing", async () => {
    // printAccount is called outside any try in cmdStatus; an id_token that is
    // not a JWT must not reject out of main().
    const deps = fakeDeps({
      loadCred: async () => makeCred({ id_token: "opaque-not-a-jwt" }),
      extractEmail: realExtractEmail,
      extractPlan: realExtractPlanType,
    });
    const code = await main(["status"], deps);
    expect(code).toBe(0);
    expect(deps.output.out.join("\n")).toContain("Connected account: <unknown>");
  });

  test("with a credential but model fetch failure still prints account info", async () => {
    const deps = fakeDeps({
      fetchModels: async () => {
        throw new Error("models down");
      },
    });
    const code = await main(["status"], deps);
    expect(code).toBe(0);
    const text = deps.output.out.join("\n");
    expect(text).toContain("a@b.com");
    expect(text.toLowerCase()).toContain("unavailable");
  });
});

/* -------------------------------------------------------------------------- */
/* logout                                                                      */
/* -------------------------------------------------------------------------- */

describe("cli — logout", () => {
  test("deletes the credential and prints confirmation", async () => {
    const deps = fakeDeps();
    const code = await main(["logout"], deps);
    expect(code).toBe(0);
    expect(deps.deletedProfileDir).toBe(PROFILE_DIR);
    expect(deps.output.out.join("\n").toLowerCase()).toContain("logout");
  });

  test("logout is idempotent when no credential exists", async () => {
    const deps = fakeDeps({ loadCred: async () => null });
    const code = await main(["logout"], deps);
    expect(code).toBe(0);
    expect(deps.deletedProfileDir).toBe(PROFILE_DIR);
  });

  test("returns nonzero and truthful stderr when local credential deletion fails", async () => {
    const deps = fakeDeps({
      deleteCred: async () => {
        throw new Error("permission denied");
      },
    });
    const code = await main(["logout"], deps);
    expect(code).toBe(1);
    expect(deps.output.out).toHaveLength(0);
    expect(deps.output.err.join("\n")).toContain("Local credential deletion failed: permission denied");
  });
});

/* -------------------------------------------------------------------------- */
/* createDeps                                                                  */
/* -------------------------------------------------------------------------- */

describe("createDeps", () => {
  test("returns a CliDeps wired to the real implementations with config defaults", () => {
    const deps = createDeps();
    expect(deps.ua).toBe(DEFAULT_UA);
    expect(typeof deps.authorize).toBe("function");
    expect(typeof deps.generate).toBe("function");
    expect(typeof deps.countTokens).toBe("function");
    expect(typeof deps.createGateway).toBe("function");
    expect(typeof deps.launchClaude).toBe("function");
    expect(deps.config.profileDir.length).toBeGreaterThan(0);
  });

  test("selects the Codex CLI user-agent when configured", () => {
    const deps = createDeps({}, { LUCA_CODE_USE_CODEX_UA: "true" });
    expect(deps.ua).toBe(CODEX_CLI_RS_UA);
  });
});

describe("production generate wiring", () => {
  test("binds profile, originator, selected UA, client version, and 401 refresh once", async () => {
    let captured: GenerateDeps | undefined;
    let refreshOptions: { profileDir: string; ua: string; rejectedAccess: string } | undefined;
    const providerGenerate = async (_opts: GenerateOptions, deps?: GenerateDeps) => {
      captured = deps;
      return {
        model: "gpt-5",
        blocks: [{ type: "text" as const, text: "ok" }],
        stop_reason: "end_turn" as const,
        usage: { input_tokens: 1, output_tokens: 1 },
      };
    };
    const bound = bindGenerateDependencies(providerGenerate, {
      profileDir: "/profiles/luca-code",
      originator: "custom-originator",
      ua: CODEX_CLI_RS_UA,
      version: CLIENT_VERSION,
      forceRefresh: async (opts) => {
        refreshOptions = opts;
        return makeCred({ access: "refreshed" });
      },
    });

    await bound(generateOptionsFixture(), { signal: new AbortController().signal });

    expect(captured?.profileDir).toBe("/profiles/luca-code");
    expect(captured?.originator).toBe("custom-originator");
    expect(captured?.ua).toBe(CODEX_CLI_RS_UA);
    expect(captured?.version).toBe(CLIENT_VERSION);
    expect(captured?.signal).toBeInstanceOf(AbortSignal);
    // The bound forceRefresh must REACH the provider, and reach it unwrapped:
    // bindGenerateDependencies binds, it does not rewrite. Sentinel arguments
    // that differ from every bound value make that observable — a dropped hook
    // throws here, and a rewriting wrapper (the productionGenerateDeps
    // behaviour asserted below) would overwrite them with /profiles/luca-code.
    expect(typeof captured?.forceRefresh).toBe("function");
    await captured!.forceRefresh!({
      profileDir: "/caller-supplied",
      ua: "caller-supplied-ua",
      rejectedAccess: "rejected",
    });
    expect(refreshOptions).toEqual({
      profileDir: "/caller-supplied",
      ua: "caller-supplied-ua",
      rejectedAccess: "rejected",
    });
  });

  test("per-call deps override the bound production deps", async () => {
    let captured: GenerateDeps | undefined;
    const providerGenerate = async (_opts: GenerateOptions, deps?: GenerateDeps) => {
      captured = deps;
      return {
        model: "gpt-5",
        blocks: [{ type: "text" as const, text: "ok" }],
        stop_reason: "end_turn" as const,
        usage: { input_tokens: 1, output_tokens: 1 },
      };
    };
    const ac = new AbortController();
    const bound = bindGenerateDependencies(providerGenerate, {
      profileDir: "/profiles/luca-code",
      ua: DEFAULT_UA,
      responsesEndpoint: "https://bound.example/responses",
    });

    await bound(generateOptionsFixture(), {
      signal: ac.signal,
      responsesEndpoint: "https://per-call.example/responses",
    });

    // per-call wins…
    expect(captured?.responsesEndpoint).toBe("https://per-call.example/responses");
    expect(captured?.signal).toBe(ac.signal);
    // …while unmentioned bound fields survive.
    expect(captured?.profileDir).toBe("/profiles/luca-code");
    expect(captured?.ua).toBe(DEFAULT_UA);
  });

  test("productionGenerateDeps pins profileDir, UA, version, and the 401 refresh", async () => {
    let refreshOptions: ForceRefreshOptions | undefined;
    const config = loadConfig({ LUCA_CODE_PROFILE_DIR: "/p", LUCA_CODE_USE_CODEX_UA: "true", LUCA_CODE_ORIGINATOR: "my-bridge" });
    const bound = productionGenerateDeps(config, CODEX_CLI_RS_UA, async (opts) => {
      refreshOptions = opts;
      return makeCred({ access: "refreshed" });
    });

    expect(bound.profileDir).toBe("/p");
    expect(bound.originator).toBe("my-bridge");
    expect(bound.ua).toBe(CODEX_CLI_RS_UA);
    expect(bound.version).toBe(CLIENT_VERSION);

    // The refresh hook ignores a caller-supplied profileDir/ua — an empty
    // profileDir here is what makes the production 401 retry path dead.
    await bound.forceRefresh?.({ profileDir: "", ua: "ignored", rejectedAccess: "rejected" });
    expect(refreshOptions).toEqual({
      profileDir: "/p",
      ua: CODEX_CLI_RS_UA,
      rejectedAccess: "rejected",
    });
  });

  test("passes the bound production functions into the gateway", async () => {
    let gatewayDeps: GatewayDeps | undefined;
    const deps = fakeDeps({
      createGateway: (incoming) => {
        gatewayDeps = incoming;
        return fakeGateway();
      },
    });
    await main(["claude"], deps);
    expect(gatewayDeps?.generate).toBe(deps.generate);
    expect(gatewayDeps?.countTokens).toBe(deps.countTokens);
  });
});