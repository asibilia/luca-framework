---
"@alecsibilia/luca-mastracode": patch
---

Remove dead writeFileTool FileNotFoundError patch from launch.ts

The patch targeted an upstream `@mastra/core@1.28.0` bug where `FileNotFoundError`
lacked a `code` property, causing `isEnoentError()` to fail during the `expectedMtime`
precheck for new file writes. This bug was fixed in `@mastra/core@1.29.0` — both
installed versions (1.29.0 and 1.29.1) have the fix. The patch's fallback path was
also broken (AI SDK never populates `context.workspace`), making it fully dead code.
