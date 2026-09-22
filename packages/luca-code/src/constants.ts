/**
 * luca-code — static OpenAI / ChatGPT constants.
 *
 * Values are ported verbatim from macaz `internal/provider/openai/auth.go` so
 * that the local proxy speaks the same device-flow and codex-backend dialect
 * as the upstream client. Times that are expressed as seconds in the Go source
 * are stored here as milliseconds (the unit the runtime needs for setTimeout /
 * interval bookkeeping); the `_MS` suffix makes the unit explicit.
 */

/**
 * OAuth client id minted for the codex device flow.
 */
export const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";

/**
 * Authorization server issuer. All device-flow endpoints are derived from this.
 */
export const ISSUER = "https://auth.openai.com";

/**
 * Device authorization request endpoint (issuer + "/codex/device").
 */
export const DEVICE_URL = `${ISSUER}/codex/device`;

/**
 * User-code issuance endpoint (issuer + "/api/accounts/deviceauth/usercode").
 */
export const DEVICE_USER_CODE_URL = `${ISSUER}/api/accounts/deviceauth/usercode`;

/**
 * Device token exchange endpoint (issuer + "/api/accounts/deviceauth/token").
 */
export const DEVICE_TOKEN_URL = `${ISSUER}/api/accounts/deviceauth/token`;

/**
 * OAuth token endpoint (issuer + "/oauth/token").
 */
export const TOKEN_ENDPOINT = `${ISSUER}/oauth/token`;

/**
 * Device flow callback landing page (issuer + "/deviceauth/callback").
 */
export const DEVICE_CALLBACK_URL = `${ISSUER}/deviceauth/callback`;

/**
 * ChatGPT backend — codex Responses API endpoint.
 */
export const RESPONSES_ENDPOINT = "https://chatgpt.com/backend-api/codex/responses";

/**
 * ChatGPT backend — codex models listing endpoint.
 */
export const MODELS_ENDPOINT = "https://chatgpt.com/backend-api/codex/models";

/**
 * Codex client version string used in UA / originator headers.
 */
export const CLIENT_VERSION = "0.144.5";

/**
 * Skew applied before a token's expiry when scheduling proactive refresh,
 * expressed in milliseconds (Go source uses 60s).
 */
export const REFRESH_SKEW_MS = 60_000;

/**
 * Safety margin added to the polling interval when awaiting device
 * authorization, expressed in milliseconds (Go source uses +3s).
 */
export const POLL_SAFETY_MS = 3_000;