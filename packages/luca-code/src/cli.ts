#!/usr/bin/env bun
/**
 * luca-code CLI entry — step 16.
 *
 * Wires the four commands onto the modules built in steps 4-15:
 *
 *   login     — run authorizeSubscription device flow, persist via saveCredentials,
 *               print the connected email + plan.
 *   claude    — ensure a credential (else "run luca-code login first"),
 *               fetch subscription models, start the loopback gateway
 *               (createGateway + installModels), prepareClaudeProfile, launch
 *               Claude with the gateway URL + token + public model ids, and
 *               close the gateway on exit.
 *   status    — show provider, connected account email + plan, available models,
 *               and gateway session stats.
 *   logout    — deleteCredentials.
 *
 * Arg parsing is deliberately minimal (no heavy dep): the first positional is
 * the command; everything after `claude` is forwarded verbatim. All side
 * effects are injected via {@link CliDeps} so the suite never touches the
 * network, the disk credential store, or a real `claude` binary.
 *
 * Schema-first per the global rules: defaults live on the Config schema (not
 * in destructuring); functional style only (closures/factory, no classes);
 * Bun-native (no node:http / express / dotenv). Relative imports are
 * extensionless; type-only imports use `import type` (verbatimModuleSyntax).
 */

import { CLIENT_VERSION } from "./constants";
import { loadConfig, CODEX_CLI_RS_UA, DEFAULT_UA } from "./config";
import type { Config } from "./config";
import { authorizeSubscription } from "./auth/openai-subscription";
import type { AuthorizeOptions } from "./auth/openai-subscription";
import { getCredentials as getCredentialsImpl, forceRefresh as forceRefreshImpl } from "./auth/openai-subscription";
import type { GetCredentialsOptions, ForceRefreshOptions } from "./auth/openai-subscription";
import { loadCredentials, saveCredentials, deleteCredentials } from "./auth/credentials";
import type { Credential } from "./auth/credentials";
import { extractEmail, extractPlanType } from "./auth/jwt";
import { fetchSubscriptionModels } from "./provider/models";
import type { FetchSubscriptionModelsOptions, Model } from "./provider/models";
import { createGateway } from "./gateway/server";
import type { Gateway, GatewayDeps } from "./gateway/server";
import type { CountTokensFn, GenerateFn } from "./gateway/handlers";
import { generate, countTokens, providerDepsFromConfig } from "./provider/openai";
import type { GenerateDeps } from "./provider/openai";
import { prepareClaudeProfile } from "./launcher/profile";
import type { PrepareResult } from "./launcher/profile";
import { launchClaude } from "./launcher/claude";

/* -------------------------------------------------------------------------- */
/* VERSION + public prefix                                                     */
/* -------------------------------------------------------------------------- */

/** CLI/package version. Re-exported by src/index.ts. */
export const VERSION = "0.1.0";

/** Prefix for public-facing model IDs advertised to Claude Code. */
const PUBLIC_ID_PREFIX = "claude-luca-code-";

/* -------------------------------------------------------------------------- */
/* CliDeps — injectable side effects                                           */
/* -------------------------------------------------------------------------- */

/**
 * Injectable side-effect surface for the CLI. Every network / disk / process
 * call is a function field here so the suite can swap in fakes. Real defaults
 * are assembled by {@link createDeps}.
 */
export interface CliDeps {
  /** Loaded config (schema defaults + LUCA_CODE_* env overrides). */
  config: Config;
  /** User-Agent sent on every outbound request. */
  ua: string;
  /** Load the persisted credential (null when absent / invalid). */
  loadCred: (profileDir: string) => Promise<Credential | null>;
  /** Persist a credential to the profile dir. */
  saveCred: (profileDir: string, cred: Credential) => Promise<void>;
  /** Delete the persisted credential (idempotent). */
  deleteCred: (profileDir: string) => Promise<void>;
  /** Run the OpenAI device-authorization flow (returns an unsaved credential). */
  authorize: (opts: AuthorizeOptions) => Promise<Credential>;
  /** Fetch the ChatGPT subscription model listing. */
  fetchModels: (opts: FetchSubscriptionModelsOptions) => Promise<Model[]>;
  /** Load + auto-refresh the credential (throws when absent). */
  getCredential: (opts: GetCredentialsOptions) => Promise<Credential>;
  /** Force-refresh the credential after a 401. */
  forceRefresh: (opts: ForceRefreshOptions) => Promise<Credential>;
  /** Generate through the provider with production dependencies bound once. */
  generate: GenerateFn;
  /** Estimate request tokens locally. */
  countTokens: CountTokensFn;
  /** Build a loopback gateway handle. */
  createGateway: (deps: GatewayDeps) => Gateway;
  /** Prepare the Claude Code profile directory. */
  prepareProfile: (rawOpts: unknown) => PrepareResult;
  /** Launch Claude Code through the gateway; returns the mapped exit code. */
  launchClaude: (rawOpts: unknown) => Promise<number>;
  /** Extract the email claim from an id_token. */
  extractEmail: (idToken: string) => string;
  /** Extract the chatgpt_plan_type claim from an id_token. */
  extractPlan: (idToken: string) => string;
  /** Stdout sink (console.log by default). */
  log: (msg: string) => void;
  /** Stderr sink (console.error by default). */
  error: (msg: string) => void;
}

/**
 * Bind production {@link GenerateDeps} onto a {@link GenerateFn} once, at the
 * only layer that owns the loaded {@link Config}.
 *
 * Per-call deps supplied by the gateway (notably `signal`) override the bound
 * production deps, so cancellation still flows through per request while
 * profileDir / originator / ua / version stay pinned to the config. Without
 * this the provider falls back to its unbound defaults — most damagingly an
 * empty `profileDir`, which makes the 401 refresh-and-retry path resolve a
 * cwd-relative directory that never exists.
 */
export function bindGenerateDependencies(generateFn: GenerateFn, bound: GenerateDeps): GenerateFn {
  return (opts, callDeps) => generateFn(opts, { ...bound, ...(callDeps ?? {}) });
}

/**
 * Build the production {@link GenerateDeps} the CLI binds onto `generate`.
 *
 * `providerDepsFromConfig` owns profileDir / originator / ua / version — this
 * only adds the 401 refresh hook, pinned to the same profile dir and UA so a
 * caller cannot redirect the refresh at a different profile. `refreshFn` is
 * injectable purely so the binding is observable in tests without touching
 * the disk credential store.
 */
export function productionGenerateDeps(
  config: Config,
  ua: string,
  refreshFn: (opts: ForceRefreshOptions) => Promise<Credential> = forceRefreshImpl,
): GenerateDeps {
  return {
    ...providerDepsFromConfig(config),
    forceRefresh: (opts: ForceRefreshOptions) =>
      refreshFn({ ...opts, profileDir: config.profileDir, ua }),
  };
}

/**
 * Assemble the default CliDeps wired to the real implementations. Accepts an
 * optional overrides map for tests / advanced wiring. The config is loaded
 * from `Bun.env` unless an explicit `env` is supplied.
 */
export function createDeps(overrides: Partial<CliDeps> = {}, env: Record<string, string | undefined> = Bun.env): CliDeps {
  const config = loadConfig(env);
  const ua = config.useCodexCliRsUa ? CODEX_CLI_RS_UA : DEFAULT_UA;

  const base: CliDeps = {
    config,
    ua,
    loadCred: (profileDir: string) => loadCredentials(profileDir),
    saveCred: (profileDir: string, cred: Credential) => saveCredentials(profileDir, cred),
    deleteCred: (profileDir: string) => deleteCredentials(profileDir),
    authorize: (opts: AuthorizeOptions) => authorizeSubscription(opts),
    fetchModels: (opts: FetchSubscriptionModelsOptions) => fetchSubscriptionModels(opts),
    getCredential: (opts: GetCredentialsOptions) => getCredentialsImpl(opts),
    forceRefresh: (opts: ForceRefreshOptions) => forceRefreshImpl(opts),
    generate: bindGenerateDependencies(generate, productionGenerateDeps(config, ua)),
    countTokens: (req) => countTokens(req),
    createGateway: (deps: GatewayDeps) => createGateway(deps),
    prepareProfile: (rawOpts: unknown) => prepareClaudeProfile(rawOpts),
    launchClaude: (rawOpts: unknown) => launchClaude(rawOpts),
    extractEmail: (idToken: string) => extractEmail(idToken),
    extractPlan: (idToken: string) => extractPlanType(idToken),
    log: (msg: string) => console.log(msg),
    error: (msg: string) => console.error(msg),
  };
  return { ...base, ...overrides };
}

/* -------------------------------------------------------------------------- */
/* helpers                                                                      */
/* -------------------------------------------------------------------------- */

/** Build the public-facing id for an upstream model slug. */
function publicIdFor(model: Model): string {
  return `${PUBLIC_ID_PREFIX}${model.id}`;
}

/** Resolve the default (first listable) model from a catalog. */
function defaultModel(models: readonly Model[]): Model | undefined {
  return models.find((m) => m.Default) ?? models[0];
}

/** Print the help text. */
function printHelp(deps: CliDeps): void {
  const help = [
    `luca-code v${VERSION}`,
    "",
    "Run Claude Code on a ChatGPT subscription via a local proxy.",
    "",
    "USAGE",
    "  luca-code <command> [args...]",
    "",
    "COMMANDS",
    "  login              Authorize via OpenAI device flow and store credentials.",
    "  claude [args...]   Run Claude Code through the loopback gateway.",
    "  status             Show connected account, plan, and available models.",
    "  logout             Delete stored credentials.",
    "  help, --help, -h   Show this help.",
    "  version, --version Print version.",
    "",
    "ENV",
    "  LUCA_CODE_*             Override config (see config.ts).",
  ].join("\n");
  deps.log(help);
}

/** Print a connected-account summary line (email + plan). */
function printAccount(deps: CliDeps, cred: Credential): void {
  const email = deps.extractEmail(cred.id_token);
  const plan = deps.extractPlan(cred.id_token);
  if (email) deps.log(`Connected account: ${email}`);
  else deps.log("Connected account: <unknown>");
  if (plan) deps.log(`Plan: ${plan}`);
}

/* -------------------------------------------------------------------------- */
/* commands                                                                     */
/* -------------------------------------------------------------------------- */

/** login — device flow + persist + print email/plan. */
async function cmdLogin(deps: CliDeps): Promise<number> {
  try {
    const cred = await deps.authorize({
      ready: (info) => {
        deps.log(`Open ${info.deviceURL} and enter the code: ${info.userCode}`);
        deps.log("Waiting for authorization...");
      },
      ua: deps.ua,
    });
    await deps.saveCred(deps.config.profileDir, cred);
    deps.log("Authorized successfully.");
    printAccount(deps, cred);
    return 0;
  } catch (err) {
    deps.error(`login failed: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

/** status — provider, account, plan, models. */
async function cmdStatus(deps: CliDeps): Promise<number> {
  deps.log(`Provider: openai`);
  const cred = await deps.loadCred(deps.config.profileDir);
  if (!cred) {
    deps.log("Status: not connected. Run `luca-code login` first.");
    return 0;
  }
  printAccount(deps, cred);
  try {
    const models = await deps.fetchModels({
      getCredentials: () => deps.getCredential({ profileDir: deps.config.profileDir, ua: deps.ua }),
      forceRefresh: (rejectedAccess: string) =>
        deps.forceRefresh({ profileDir: deps.config.profileDir, ua: deps.ua, rejectedAccess }),
      ua: deps.ua,
      accountId: cred.account_id,
    });
    if (models.length === 0) {
      deps.log("Available models: none");
    } else {
      deps.log("Available models:");
      for (const m of models) {
        const tag = m.Default ? " (default)" : "";
        deps.log(`  - ${publicIdFor(m)} — ${m.displayName}${tag}`);
      }
    }
  } catch {
    deps.log("Available models: unavailable");
  }
  return 0;
}

/**
 * logout — delete the credential.
 *
 * Reports the outcome truthfully: a deletion that failed must NOT print
 * "Credentials deleted." while the plaintext access + refresh tokens are still
 * on disk. On failure nothing goes to stdout, the reason goes to stderr, and
 * the exit code is 1.
 */
async function cmdLogout(deps: CliDeps): Promise<number> {
  try {
    await deps.deleteCred(deps.config.profileDir);
  } catch (err) {
    deps.error(
      `Local credential deletion failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }
  deps.log("Logout complete. Credentials deleted.");
  return 0;
}

/** claude — ensure cred, fetch models, gateway, profile, launch, close. */
async function cmdClaude(args: readonly string[], deps: CliDeps): Promise<number> {
  // 1. Ensure a credential exists.
  const cred = await deps.loadCred(deps.config.profileDir);
  if (!cred) {
    deps.error("Not authorized: run luca-code login first.");
    return 1;
  }

  // 2. Fetch subscription models.
  let models: Model[];
  try {
    models = await deps.fetchModels({
      getCredentials: () => deps.getCredential({ profileDir: deps.config.profileDir, ua: deps.ua }),
      forceRefresh: (rejectedAccess: string) =>
        deps.forceRefresh({ profileDir: deps.config.profileDir, ua: deps.ua, rejectedAccess }),
      ua: deps.ua,
      accountId: cred.account_id,
    });
  } catch (err) {
    deps.error(`Failed to fetch models: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
  if (models.length === 0) {
    deps.error("No models available from the subscription.");
    return 1;
  }

  const def = defaultModel(models);
  if (!def) {
    deps.error("No default model resolved from the subscription.");
    return 1;
  }

  const publicIds = models.map(publicIdFor);
  const selectedModel = publicIdFor(def);

  // 3. Start the loopback gateway + install the model catalog.
  const gateway = deps.createGateway({
    config: deps.config,
    models,
    getCredentials: async () => {
      try {
        return await deps.getCredential({ profileDir: deps.config.profileDir, ua: deps.ua });
      } catch {
        return null;
      }
    },
    // Pass the INJECTED functions through verbatim: `deps.generate` already
    // carries the production binding from createDeps (and is swappable in
    // tests). Reaching for the module-level provider imports here would bypass
    // that binding on the hottest path.
    generate: deps.generate,
    countTokens: deps.countTokens,
  });
  await gateway.start();
  gateway.installModels(models);

  try {
    // 4. Prepare the Claude Code profile directory.
    const prepared: PrepareResult = deps.prepareProfile({
      provider: "openai",
      selectedModel,
      allowedModels: publicIds,
      env: { ...Bun.env },
    });

    // 5. Launch Claude through the gateway.
    const code = await deps.launchClaude({
      args: [...args],
      models: publicIds,
      selectedModel,
      launchModel: selectedModel,
      baseUrl: gateway.url(),
      authToken: gateway.token(),
      profileDir: prepared.profileDir,
      contextWindow: def.contextWindow > 0 ? def.contextWindow : undefined,
      hasEfforts: def.efforts.length > 0,
    });
    return code;
  } catch (err) {
    deps.error(`claude failed: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  } finally {
    // 6. Always close the gateway.
    gateway.close();
  }
}

/* -------------------------------------------------------------------------- */
/* main                                                                         */
/* -------------------------------------------------------------------------- */

/**
 * CLI entrypoint. `argv` is the command + its args (typically
 * `process.argv.slice(2)`). Returns the process exit code. All side effects
 * go through the injected {@link CliDeps}; pass `createDeps()` for the real
 * wiring.
 */
export async function main(argv: string[], deps: CliDeps = createDeps()): Promise<number> {
  const cmd = argv[0] ?? "help";

  switch (cmd) {
    case "version":
    case "--version":
      deps.log(VERSION);
      return 0;
    case "help":
    case "--help":
    case "-h":
    case undefined:
      printHelp(deps);
      return 0;
    case "login":
      return cmdLogin(deps);
    case "status":
      return cmdStatus(deps);
    case "logout":
      return cmdLogout(deps);
    case "claude":
      return cmdClaude(argv.slice(1), deps);
    default:
      deps.error(`luca-code: unknown command "${cmd}".`);
      deps.error("");
      printHelp(deps);
      return 1;
  }
}

/* -------------------------------------------------------------------------- */
// process bootstrap
/* -------------------------------------------------------------------------- */

if (import.meta.main) {
  const code = await main(process.argv.slice(2));
  process.exit(code);
}