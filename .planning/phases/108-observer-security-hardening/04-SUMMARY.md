# Plan 108-04 Summary: SSRF Protection in observer-emitter.ts

**Status:** COMPLETE
**Phase:** 108 -- Observer Security Hardening
**Wave:** 1
**Plan:** 108-04
**GitHub Issue:** #44
**Branch:** 44--v2.7.0-observability-verification

## Requirements Covered

- **SSRF Prevention**: Validate that LUCA_OBSERVER_URL only points to localhost addresses before emitting events, preventing server-side request forgery.

## Changes Made

### Task 1: Add Localhost URL Validation to observer-emitter.ts

Added SSRF protection to `packages/luca-framework/src/state/observer-emitter.ts`:

1. **`ALLOWED_HOSTS` constant**: A `Set` containing `"localhost"`, `"127.0.0.1"`, and `"[::1]"` -- the three standard loopback addresses.

2. **`isLocalhostUrl()` function** (exported): Validates that a given URL string parses to a URL whose hostname is in the allowed hosts set. Returns `false` for malformed URLs or non-localhost hosts.

3. **SSRF guard in `emitObserverEvent()`**: After the existing `if (!url) return;` check, added a validation call to `isLocalhostUrl(url)`. If the URL does not point to localhost, logs an error to `console.error` with the offending URL and returns early without making any network request.

### Task 2: Add Comprehensive Tests

Updated `__tests__/packages/luca-framework/src/state/observer-emitter.test.ts`:

- Added `isLocalhostUrl` to imports
- Added 6 SSRF protection integration tests within the existing `emitObserverEvent` describe block (refuses non-localhost, refuses remote IP, allows localhost/127.0.0.1/[::1], refuses malformed URL)
- Added 9 unit tests for `isLocalhostUrl` function covering all edge cases (valid localhost variants, remote hosts, malformed URLs, empty strings, missing scheme)

## Verification Results

| Check                               | Result                                        |
| ----------------------------------- | --------------------------------------------- |
| `bunx --bun tsc --noEmit`           | PASS (no errors)                              |
| `bun test observer-emitter.test.ts` | PASS (21 tests, 33 assertions, 100% coverage) |

## Files Modified

- `packages/luca-framework/src/state/observer-emitter.ts` -- Added ALLOWED_HOSTS, isLocalhostUrl(), SSRF guard in emitObserverEvent()
- `__tests__/packages/luca-framework/src/state/observer-emitter.test.ts` -- Added 15 tests for SSRF protection and isLocalhostUrl()

## Commits

- `8013b4f` fix(108-04): #44 add SSRF protection to observer-emitter
