---
id: "108-01"
title: "API key authentication middleware + Content-Security-Policy header"
phase: 108
wave: 1
complexity: MODERATE
depends_on: []
tasks:
  - id: "108-01-1"
    title: "Add API key authentication to POST routes"
    goal: "Gate /api/events and /api/notes POST endpoints behind LUCA_OBSERVER_API_KEY env var"
    verify: "POST without X-API-Key header returns 401; POST with correct key returns 200; GET routes remain unauthenticated; missing env var disables auth (open mode)"
  - id: "108-01-2"
    title: "Add Content-Security-Policy header to next.config.ts"
    goal: "Add CSP header restricting script/style/connect sources to same-origin"
    verify: "Response headers include Content-Security-Policy; bunx --bun tsc --noEmit passes; dev server starts"
  - id: "108-01-3"
    title: "Update observer-emitter to send API key header"
    goal: "Include LUCA_OBSERVER_API_KEY in the Authorization header of outbound fetch calls"
    verify: "emitObserverEvent sends X-API-Key header when LUCA_OBSERVER_API_KEY is set"
---

# 108-01: API Key Authentication + CSP Header

## Goal

Protect the observer's write endpoints (POST /api/events, POST /api/notes) against unauthenticated access by requiring a shared API key. Add a Content-Security-Policy header to the Next.js config to restrict browser-side resource loading.

## Context

@packages/luca-observer/app/api/events/route.ts -- POST endpoint, currently unauthenticated
@packages/luca-observer/app/api/notes/route.ts -- POST endpoint, currently unauthenticated
@packages/luca-observer/next.config.ts -- Security headers config, missing CSP
@packages/luca-framework/src/state/observer-emitter.ts -- Emitter that sends events to POST /api/events

**Current state:**

- POST /api/events and POST /api/notes accept any request with valid JSON
- No authentication mechanism exists
- next.config.ts has X-Frame-Options, X-Content-Type-Options, HSTS, Referrer-Policy, Permissions-Policy -- but no CSP
- observer-emitter.ts sends fetch requests without any auth header

**Security gap:**

- Any process on the local network can inject events into the observer
- No CSP means XSS vectors are unmitigated in the dashboard UI

## Tasks

### Task 108-01-1: Add API Key Authentication to POST Routes

Create a shared auth helper and apply it to both POST endpoints.

**File to create:** `packages/luca-observer/lib/auth.ts`

```typescript
import { NextResponse } from "next/server";

/**
 * Validate API key from request headers.
 *
 * If LUCA_OBSERVER_API_KEY is not set, auth is disabled (open mode).
 * If set, the request must include a matching X-API-Key header.
 *
 * @param request - The incoming request
 * @returns null if authorized, or a 401 NextResponse if unauthorized
 */
export function requireApiKey(request: Request): NextResponse | null {
  const expectedKey = process.env.LUCA_OBSERVER_API_KEY;

  // No key configured = open mode (backward compatible)
  if (!expectedKey) return null;

  const providedKey = request.headers.get("x-api-key");

  if (!providedKey || providedKey !== expectedKey) {
    return NextResponse.json(
      { error: "unauthorized", message: "Missing or invalid X-API-Key header" },
      { status: 401 },
    );
  }

  return null;
}
```

**File to modify:** `packages/luca-observer/app/api/events/route.ts`

Add at the top of the `POST` function body, before parsing the body:

```typescript
import { requireApiKey } from "~/lib/auth";

// Inside POST handler, first line:
const authError = requireApiKey(request);
if (authError) return authError;
```

**File to modify:** `packages/luca-observer/app/api/notes/route.ts`

Same pattern -- add `requireApiKey` check at the top of the `POST` function body.

**Key decisions:**

- Use `X-API-Key` header (standard pattern for service-to-service auth)
- Open mode when env var is unset -- preserves backward compatibility for local dev
- Timing-safe comparison is not critical here (single shared key, not user passwords), but use strict equality
- GET routes (events-query, ledger, notes GET, stream) remain open -- they are read-only dashboard queries
- The auth function is a pure function returning null or a Response, following the functional patterns rule (no classes)

### Task 108-01-2: Add Content-Security-Policy Header

**File to modify:** `packages/luca-observer/next.config.ts`

Add CSP header to the existing headers array:

```typescript
{
  key: "Content-Security-Policy",
  value: [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "connect-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "frame-ancestors 'none'",
  ].join("; "),
},
```

**Why these directives:**

- `default-src 'self'` -- baseline restriction
- `script-src 'self' 'unsafe-inline' 'unsafe-eval'` -- Next.js requires inline scripts and eval for development; can be tightened with nonces in production
- `style-src 'self' 'unsafe-inline'` -- CSS-in-JS and Tailwind require inline styles
- `connect-src 'self'` -- SSE and fetch only to same origin
- `img-src 'self' data:` -- allow data URIs for inline images
- `frame-ancestors 'none'` -- reinforces X-Frame-Options DENY

### Task 108-01-3: Update observer-emitter to Send API Key

**File to modify:** `packages/luca-framework/src/state/observer-emitter.ts`

Update the `fetch` call to include the API key header when available:

```typescript
export function emitObserverEvent(
  eventType: string,
  data: Record<string, unknown> = {},
) {
  const url = process.env.LUCA_OBSERVER_URL;
  if (!url) return;

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

## Exit Criteria

1. POST /api/events returns 401 when `LUCA_OBSERVER_API_KEY` is set and request lacks `X-API-Key` header
2. POST /api/events returns 200 when correct `X-API-Key` is provided
3. POST /api/notes has identical auth behavior
4. GET endpoints remain accessible without auth
5. When `LUCA_OBSERVER_API_KEY` is not set, all endpoints work as before (open mode)
6. Content-Security-Policy header is present in all responses
7. observer-emitter.ts includes `X-API-Key` header when env var is set
8. `bunx --bun tsc --noEmit` passes
9. `bun test` passes
