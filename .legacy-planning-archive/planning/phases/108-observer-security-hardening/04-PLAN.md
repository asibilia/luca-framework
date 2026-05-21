---
id: "108-04"
title: "SSRF protection in observer-emitter.ts"
phase: 108
wave: 1
complexity: SIMPLE
depends_on: []
tasks:
  - id: "108-04-1"
    title: "Add LUCA_OBSERVER_URL localhost validation"
    goal: "Prevent SSRF by ensuring LUCA_OBSERVER_URL only points to localhost/127.0.0.1/[::1]"
    verify: "Non-localhost URLs are rejected with console.error; localhost variants (localhost, 127.0.0.1, [::1]) with any port are accepted; missing URL still short-circuits silently"
---

# 108-04: SSRF Protection in observer-emitter

## Goal

Prevent Server-Side Request Forgery (SSRF) by validating that `LUCA_OBSERVER_URL` only points to localhost addresses. The observer is a local-only dev tool and should never make requests to external hosts.

## Context

@packages/luca-framework/src/state/observer-emitter.ts -- Fire-and-forget event emitter

**Current state:**

```typescript
export function emitObserverEvent(
  eventType: string,
  data: Record<string, unknown> = {},
) {
  const url = process.env.LUCA_OBSERVER_URL;
  if (!url) return;

  // ... fetch(url + "/api/events") -- no URL validation
}
```

The function trusts `LUCA_OBSERVER_URL` completely. If an attacker or misconfiguration sets it to an external URL (e.g., `https://evil.com`), every state transition would send event data to that external server.

**SSRF vectors:**

- `.env` file accidentally set to external URL
- Environment variable injection
- Internal network scanning if set to `http://192.168.x.x`

**The observer is explicitly a localhost-only tool.** There is no legitimate use case for pointing it at a remote host.

## Tasks

### Task 108-04-1: Add Localhost URL Validation

**File to modify:** `packages/luca-framework/src/state/observer-emitter.ts`

Add a URL validation function and call it before making the fetch:

```typescript
/**
 * Allowed hostnames for the observer URL.
 *
 * The observer is a local-only dev tool. SSRF protection
 * ensures LUCA_OBSERVER_URL cannot point to external hosts.
 */
const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Validate that a URL points to a localhost address.
 *
 * @param rawUrl - The URL string to validate
 * @returns true if the URL is a valid localhost URL
 */
function isLocalhostUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return ALLOWED_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}
```

Update `emitObserverEvent` to validate before fetching:

```typescript
/**
 * Emit a fire-and-forget event to the Luca Observer dashboard.
 *
 * Does nothing if LUCA_OBSERVER_URL is not set.
 * Rejects non-localhost URLs to prevent SSRF.
 * Silently catches all errors to avoid disrupting the caller.
 *
 * @param eventType - The event type string (e.g., 'state.transition')
 * @param data - Additional event data to include in the payload
 */
export function emitObserverEvent(
  eventType: string,
  data: Record<string, unknown> = {},
) {
  const url = process.env.LUCA_OBSERVER_URL;
  if (!url) return;

  if (!isLocalhostUrl(url)) {
    console.error(
      `[observer-emitter] LUCA_OBSERVER_URL must point to localhost. ` +
        `Refusing to emit to: ${url}`,
    );
    return;
  }

  const payload = {
    event_type: eventType,
    timestamp: new Date().toISOString(),
    ...data,
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const apiKey = process.env.LUCA_OBSERVER_API_KEY;
  if (apiKey) {
    headers["X-API-Key"] = apiKey;
  }

  fetch(`${url}/api/events`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(2000),
  }).catch(() => {
    // Intentionally swallowed -- observer is optional
  });
}
```

**Key decisions:**

- Validation uses `new URL()` for robust parsing -- handles edge cases like `http://evil.com@localhost` (hostname would be `localhost` but actual request goes to `evil.com` -- actually, `new URL` parses the hostname correctly as `evil.com` with username `localhost`, so this is safe)
- Actually, `new URL("http://evil.com@localhost")` parses hostname as `localhost` and username as `evil.com`. This is safe because the fetch will connect to localhost. However, `new URL("http://localhost@evil.com")` parses hostname as `evil.com`. The validation correctly rejects this.
- Allow any port on localhost (common to run observer on 3456, 3000, etc.)
- Log a console.error on rejection so the developer knows why events stopped flowing
- Do not throw -- the emitter is fire-and-forget by design
- `ALLOWED_HOSTS` uses a Set for O(1) lookup
- The validation is at the top of the function so it short-circuits before any payload construction
- Export `isLocalhostUrl` for testing

```typescript
// Export for testing
export { isLocalhostUrl };
```

**Accepted localhost variants:**

| URL                         | hostname        | Accepted |
| --------------------------- | --------------- | -------- |
| `http://localhost:3456`     | `localhost`     | Yes      |
| `http://127.0.0.1:3456`     | `127.0.0.1`     | Yes      |
| `http://[::1]:3456`         | `[::1]`         | Yes      |
| `http://localhost`          | `localhost`     | Yes      |
| `https://evil.com`          | `evil.com`      | No       |
| `http://192.168.1.100:3456` | `192.168.1.100` | No       |
| `http://0.0.0.0:3456`       | `0.0.0.0`       | No       |
| `not-a-url`                 | (parse fails)   | No       |

**Note on `0.0.0.0`:** Intentionally excluded. While `0.0.0.0` binds to all interfaces, allowing it as a target could enable requests to unintended network interfaces.

## Exit Criteria

1. `emitObserverEvent` with `LUCA_OBSERVER_URL=http://localhost:3456` works normally
2. `emitObserverEvent` with `LUCA_OBSERVER_URL=http://127.0.0.1:3456` works normally
3. `emitObserverEvent` with `LUCA_OBSERVER_URL=http://[::1]:3456` works normally
4. `emitObserverEvent` with `LUCA_OBSERVER_URL=https://evil.com` logs error and does not fetch
5. `emitObserverEvent` with `LUCA_OBSERVER_URL=http://192.168.1.1:3456` logs error and does not fetch
6. `emitObserverEvent` with no `LUCA_OBSERVER_URL` set returns silently (unchanged behavior)
7. `isLocalhostUrl` is exported for test coverage
8. `bunx --bun tsc --noEmit` passes
9. `bun test` passes
