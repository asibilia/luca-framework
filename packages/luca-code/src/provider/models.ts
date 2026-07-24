/**
 * provider/models.ts — ChatGPT subscription model listing for luca-code.
 *
 * Ports macaz `internal/provider/openai/openai.go` `subscriptionModels`. The
 * proxy fetches the codex models listing from the ChatGPT backend using
 * subscription auth headers, parses / filters / sorts the entries, and maps
 * them to a normalized {@link Model} shape that the rest of the proxy consumes.
 *
 * Flow:
 *   1. fetch GET modelsEndpoint?client_version=<clientVersion> with the
 *      subscription auth header block (Authorization, originator, version,
 *      User-Agent, ChatGPT-Account-Id).
 *   2. On 401, force-refresh the credential once and retry.
 *   3. Parse {models:[{slug, display_name, description, default_reasoning_level,
 *      supported_reasoning_levels:[{effort}], visibility, priority,
 *      input_modalities, context_window}]}.
 *   4. Keep entries with visibility === "list", sort by priority ascending.
 *   5. Map to Model {id, displayName, description, efforts, inputModalities,
 *      contextWindow, toolCall:true, attachment: image|file in modalities}.
 *   6. Mark models[0].Default = true.
 *   7. Return [] when there are no listable models (empty = error upstream).
 *   8. Cache the result in-memory for 5 minutes per account id.
 *
 * Functional style throughout (closures, no classes), schema-first (Zod owns
 * the wire-shape defaults and validators), and Bun-native (no node:http /
 * express / dotenv). `getCredentials` and `forceRefresh` are injected so the
 * module stays unit-testable without touching the network or the disk
 * credential store.
 */

import { z } from "zod";

import { CLIENT_VERSION, MODELS_ENDPOINT } from "../constants";
import type { Credential } from "../auth/credentials";

/* -------------------------------------------------------------------------- */
/* constants                                                                   */
/* -------------------------------------------------------------------------- */

/** Originator header value advertised to the codex backend.
 *
 * Preserved as `cc-openai-bridge` for OpenAI/Cloudflare fingerprint
 * compatibility — see DEFAULT_UA in src/config.ts. Renaming this header value
 * risks the backend rejecting the request.
 */
const ORIGINATOR = "cc-openai-bridge";

/** In-memory cache TTL for the models listing (5 minutes, in ms). */
export const MODELS_CACHE_TTL_MS = 5 * 60 * 1000;

/* -------------------------------------------------------------------------- */
/* schemas — single source of truth for the wire shape and defaults          */
/* -------------------------------------------------------------------------- */

/** A supported reasoning level entry: `{effort}` plus any passthrough fields. */
const ReasoningLevelSchema = z
  .object({
    effort: z.string(),
  })
  .passthrough();

/**
 * One model entry as returned by the codex models endpoint. Passthrough keeps
 * unknown fields for round-trip fidelity. Defaults ensure mapping never throws
 * on a sparse entry.
 */
const ModelEntrySchema = z
  .object({
    slug: z.string().min(1),
    display_name: z.string().default(""),
    description: z.string().default(""),
    default_reasoning_level: z.string().optional(),
    supported_reasoning_levels: z.array(ReasoningLevelSchema).default([]),
    visibility: z.string().default(""),
    priority: z.number().default(Number.MAX_SAFE_INTEGER),
    input_modalities: z.array(z.string()).default([]),
    context_window: z.number().int().nonnegative().default(0),
  })
  .passthrough();

/** Top-level response shape: `{models: [...]}`. */
const ModelsResponseSchema = z
  .object({
    models: z.array(ModelEntrySchema).default([]),
  })
  .passthrough();

type ModelEntry = z.infer<typeof ModelEntrySchema>;

/* -------------------------------------------------------------------------- */
/* public types                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Normalized model descriptor consumed by the rest of the proxy. Field names
 * follow the macaz `Model` shape; `Default` (capitalized) mirrors the upstream
 * Go exported field.
 */
export interface Model {
  /** Model slug — the identifier passed in API requests. */
  id: string;
  /** Human-readable display name. */
  displayName: string;
  /** Short description of the model. */
  description: string;
  /** Supported reasoning-effort levels (from `supported_reasoning_levels[].effort`). */
  efforts: string[];
  /** Input modalities accepted by the model (text, image, file, ...). */
  inputModalities: string[];
  /** Maximum context window in tokens. */
  contextWindow: number;
  /** Always true — subscription models support tool calls. */
  toolCall: boolean;
  /** True when `input_modalities` includes image or file. */
  attachment: boolean;
  /** True for the first (lowest-priority) listable model; false otherwise. */
  Default: boolean;
}

/** Options for {@link fetchSubscriptionModels}. */
export interface FetchSubscriptionModelsOptions {
  /** Returns the current subscription credential (access token used as Bearer). */
  getCredentials: () => Promise<Credential>;
  /**
   * Force-refreshes the credential after a 401. Receives the access token that
   * was just rejected so the caller can detect a concurrent rotation. Injected
   * so the retry path is unit-testable without a disk credential store.
   */
  forceRefresh: (rejectedAccess: string) => Promise<Credential>;
  /** User-Agent header sent on the request. */
  ua: string;
  /** ChatGPT-Account-Id header value. */
  accountId: string;
}

/* -------------------------------------------------------------------------- */
/* in-memory cache                                                             */
/* -------------------------------------------------------------------------- */

interface CacheEntry {
  accountId: string;
  models: Model[];
  fetchedAt: number;
}

let cache: CacheEntry | null = null;

/** Clear the in-memory models cache. Intended for tests / config changes. */
export function clearModelsCache(): void {
  cache = null;
}

/* -------------------------------------------------------------------------- */
/* internal helpers                                                            */
/* -------------------------------------------------------------------------- */

/** Build the subscription auth header block for a credential + account. */
function authHeaders(cred: Credential, ua: string, accountId: string): Record<string, string> {
  return {
    Authorization: `Bearer ${cred.access}`,
    originator: ORIGINATOR,
    version: CLIENT_VERSION,
    "User-Agent": ua,
    "ChatGPT-Account-Id": accountId,
  };
}

/** True when an input modality list indicates image or file support. */
function supportsAttachment(modalities: string[]): boolean {
  return modalities.includes("image") || modalities.includes("file");
}

/** Map a raw parsed entry to the normalized {@link Model} shape. */
function toModel(entry: ModelEntry): Model {
  return {
    id: entry.slug,
    displayName: entry.display_name,
    description: entry.description,
    efforts: entry.supported_reasoning_levels.map((lvl) => lvl.effort),
    inputModalities: entry.input_modalities,
    contextWindow: entry.context_window,
    toolCall: true,
    attachment: supportsAttachment(entry.input_modalities),
    Default: false,
  };
}

/** Parse, filter, sort, map, and mark the default model. Returns []. */
function transform(raw: unknown): Model[] {
  const parsed = ModelsResponseSchema.safeParse(raw);
  if (!parsed.success) return [];

  const listable = parsed.data.models.filter((m) => m.visibility === "list");
  // Sort by priority ascending; stable for equal priorities.
  listable.sort((a, b) => a.priority - b.priority);

  const models = listable.map(toModel);
  const first = models[0];
  if (first) {
    first.Default = true;
  }
  return models;
}

/** Build a non-2xx error for a fetch response, best-effort including the body. */
async function non2xxError(label: string, res: Response): Promise<Error> {
  let snippet = "";
  try {
    const text = await res.text();
    snippet = text ? ` — ${text.slice(0, 200)}` : "";
  } catch {
    /* ignore body read failure */
  }
  return new Error(`${label} failed: HTTP ${res.status}${snippet}`);
}

/* -------------------------------------------------------------------------- */
/* public API                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Fetch the ChatGPT subscription model listing and return the normalized
 * {@link Model} list.
 *
 * GETs `MODELS_ENDPOINT?client_version=<CLIENT_VERSION>` with the subscription
 * auth header block. On 401, force-refreshes the credential once and retries.
 * The result is cached in-memory for {@link MODELS_CACHE_TTL_MS} per account.
 *
 * Returns `[]` when the endpoint yields no listable models (treated as an
 * upstream error by callers) or when the response fails to parse.
 */
export async function fetchSubscriptionModels(
  opts: FetchSubscriptionModelsOptions,
): Promise<Model[]> {
  // Serve a fresh-enough cache entry without touching the network.
  if (cache && cache.accountId === opts.accountId && Date.now() - cache.fetchedAt < MODELS_CACHE_TTL_MS) {
    return cache.models;
  }

  const url = `${MODELS_ENDPOINT}?client_version=${CLIENT_VERSION}`;
  let cred = await opts.getCredentials();

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, { method: "GET", headers: authHeaders(cred, opts.ua, opts.accountId) });

    if (res.status === 401 && attempt === 0) {
      // Force-refresh once and retry with the new credential.
      cred = await opts.forceRefresh(cred.access);
      continue;
    }
    if (!res.ok) {
      throw await non2xxError("subscription models", res);
    }

    const data: unknown = await res.json();
    const models = transform(data);
    cache = { accountId: opts.accountId, models, fetchedAt: Date.now() };
    return models;
  }

  // Unreachable: the loop either returns or throws on the second attempt.
  return [];
}