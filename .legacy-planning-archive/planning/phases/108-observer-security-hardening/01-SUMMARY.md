# Plan 108-01 Summary: API Key Authentication + CSP Header

## Status: COMPLETE

## Changes Made

### 1. API Key Authentication (`lib/auth.ts`)

- Created `packages/luca-observer/lib/auth.ts` with `requireApiKey()` function
- When `LUCA_OBSERVER_API_KEY` is not set, auth is disabled (open mode for local dev)
- When set, requests must include a matching `X-API-Key` header or receive 401

### 2. POST Route Protection

- **`app/api/events/route.ts`**: Added `requireApiKey` check at the top of POST handler
- **`app/api/notes/route.ts`**: Added `requireApiKey` check at the top of POST handler
- GET routes remain unauthenticated (read-only dashboard data)

### 3. Content-Security-Policy Header

- Added CSP header to `next.config.ts` security headers array
- Directives: `default-src 'self'`, `script-src 'self' 'unsafe-inline' 'unsafe-eval'`, `style-src 'self' 'unsafe-inline'`, `connect-src 'self'`, `img-src 'self' data:`, `font-src 'self'`, `frame-ancestors 'none'`

### 4. Observer Emitter API Key Support

- Updated `packages/luca-framework/src/state/observer-emitter.ts` to send `X-API-Key` header when `LUCA_OBSERVER_API_KEY` env var is set
- Backward compatible: header is only added when the env var is present

## Files Changed

- `packages/luca-observer/lib/auth.ts` (NEW)
- `packages/luca-observer/app/api/events/route.ts` (MODIFIED)
- `packages/luca-observer/app/api/notes/route.ts` (MODIFIED)
- `packages/luca-observer/next.config.ts` (MODIFIED)
- `packages/luca-framework/src/state/observer-emitter.ts` (MODIFIED)

## Verification

- `bunx --bun tsc --noEmit`: PASS (0 errors)
- `bun test` (observer tests): 46/46 PASS
