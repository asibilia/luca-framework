---
"@luca/engine": patch
---

On macOS, test-writers and implementers may now write the per-user temp folder (the real path of `getconf DARWIN_USER_TEMP_DIR`) inside their sandbox. Foundation stages atomic writes there, not in `$TMPDIR`, so agents' own `swift test` and `xcodebuild` runs failed to rebuild with "unable to write manifest … Operation not permitted". Reviewers and the learner don't get it, and off macOS, or when `getconf` fails, nothing changes.
