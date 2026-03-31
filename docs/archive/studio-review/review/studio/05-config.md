# S-10 — Config Page Crash

## Symptom

The Configure > Config page crashes, displaying a Next.js error overlay:

```
Runtime Error: Save failed for complexity with status 500

at putSection (hooks/use-config-save.ts:59:11)
at async useConfigSave.useCallback[save] (hooks/use-config-save.ts:104:5)
at RootLayout (app/layout.tsx:38:11)
```

## Investigation Status: Root Cause Identified

The crash is NOT a render error — it's an **unhandled save error** from `PUT /api/config/complexity` returning HTTP 500. The error propagates as an unhandled promise rejection, which the Next.js error boundary catches and displays.

## Root Cause: Two-Layer Failure

### Layer 1: Save triggered (intentionally or accidentally)

The save can be triggered by:

- **Cmd+S keyboard shortcut** — The `useKeyboardShortcuts` hook (`hooks/use-keyboard-shortcuts.ts:121-127`) fires `void saveCallback()` on Cmd+S. The config page registers its save function as the global callback on mount.
- **Command palette** — "Save" action in command palette calls `saveCallback()`

When the user navigates to `/config`, the save callback is registered immediately via:

**File:** `packages/luca-studio/app/config/page.tsx:47-50`

```typescript
useEffect(() => {
  setSaveCallback(() => save());
  return () => setSaveCallback(null);
}, [save, setSaveCallback]);
```

Any subsequent Cmd+S (or auto-trigger) calls `save()`.

### Layer 2: PUT /api/config/complexity returns 500

**File:** `packages/luca-studio/lib/config-section-handler.ts:141-160`

The handler reads `.planning/config.json` using `Bun.file()`. A 500 response is returned when:

- The file read fails (permissions, file locked by another process, corrupted JSON)
- The file write fails (disk full, permissions, atomic write failure)

```typescript
try {
  const root = await resolveProjectRoot();
  configPath = join(root, ".planning", "config.json");
  const exists = await Bun.file(configPath).exists();
  if (exists) {
    rawFileContent = await Bun.file(configPath).text();
    fullConfig = JSON.parse(rawFileContent) as Record<string, unknown>;
  }
} catch (err) {
  return NextResponse.json(
    { errors: [{ code: "READ_FAILED", message }] },
    { status: 500 }, // <-- THIS is what the user sees
  );
}
```

### Layer 3: Error is unhandled at the call site

**File:** `packages/luca-studio/hooks/use-keyboard-shortcuts.ts:121-126`

```typescript
if (mod && e.key === "s") {
  e.preventDefault();
  if (saveCallback) {
    void saveCallback(); // No try/catch — error propagates as unhandled rejection
  }
  return;
}
```

The `save()` function throws on non-OK responses:

**File:** `packages/luca-studio/hooks/use-config-save.ts:57-62`

```typescript
if (!res.ok) {
  const body = await res.json().catch(() => ({}));
  throw new Error(
    (body as { error?: string }).error ??
      `Save failed for ${section} with status ${res.status}`,
  );
}
```

The 500 response body has structure `{ errors: [...] }` (not `{ error: "..." }`), so `body.error` is `undefined`, and the fallback message is used: `"Save failed for complexity with status 500"`.

## Why It Appears to Crash "On Load"

Most likely one of:

1. **User pressed Cmd+S by habit** while navigating — the save callback was already registered by the time the keystroke fired
2. **A stale dirty flag** from a previous session (persisted in localStorage) triggered auto-save logic
3. **The config file is temporarily locked or unreadable** when the page loads, causing the first programmatic save to fail

## Fixes Required

### Fix 1: Wrap save calls in try/catch (Critical)

**File:** `packages/luca-studio/hooks/use-keyboard-shortcuts.ts:121-126`

```typescript
if (mod && e.key === "s") {
  e.preventDefault();
  if (saveCallback) {
    saveCallback().catch((err) => {
      console.error("[keyboard-shortcut] Save failed:", err.message);
    });
  }
  return;
}
```

### Fix 2: Handle error response body shape correctly

**File:** `packages/luca-studio/hooks/use-config-save.ts:57-62`

```typescript
if (!res.ok) {
  const body = await res.json().catch(() => ({}));
  const message =
    (body as { error?: string }).error ??
    (body as { errors?: Array<{ message?: string }> }).errors?.[0]?.message ??
    `Save failed for ${section} with status ${res.status}`;
  throw new Error(message);
}
```

### Fix 3: Don't save unless dirty (Defense in depth)

**File:** `packages/luca-studio/hooks/use-config-save.ts:93-94`

```typescript
const save = useCallback(async () => {
  if (!config) return;
  if (!dirtySet.has("config")) return;  // <-- add this guard
  // ...
```

### Fix 4: Investigate the 500 root cause

Check why `PUT /api/config/complexity` returns 500:

- Run `cat .planning/config.json | python3 -m json.tool` to verify the file is valid JSON
- Check file permissions: `ls -la .planning/config.json`
- Check if another process has the file locked

## Files Involved

| File                                                         | Lines         | Issue                                     |
| ------------------------------------------------------------ | ------------- | ----------------------------------------- |
| `packages/luca-studio/hooks/use-config-save.ts`              | 57-62, 93-104 | Throws on 500, no dirty guard             |
| `packages/luca-studio/hooks/use-keyboard-shortcuts.ts`       | 121-126       | `void saveCallback()` — no error handling |
| `packages/luca-studio/lib/config-section-handler.ts`         | 141-160       | Returns 500 on read/write failure         |
| `packages/luca-studio/app/config/page.tsx`                   | 47-50         | Registers save callback on mount          |
| `packages/luca-studio/components/layout/command-palette.tsx` | 164           | Also invokes save callback                |
