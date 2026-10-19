# @luca/engine: the feature map

This page goes on from [A ticket's steps, fix loops, and bad tests](ticket-steps.md).

**The feature map (#583).** Left alone, tickets add new test files wherever
they like and the suite sprawls. A repo can keep a **feature map**, a markdown
file that says which test files prove which feature, and name it in
`.luca/config.json`:

```json
{ "checks": { "test": "bun test" }, "feature_map": "docs/feature-map.md" }
```

The path is relative to the repo root and names a path inside the repo: an
absolute path, one that leaves the repo with `..`, the repo root, or one with
a trailing `/` is a config error naming `feature_map`. Every part of the
engine reads it through `featureMapPath` (`config/engine-config.ts`), which
cleans it the way a worktree path is cleaned everywhere else:
`./docs/feature-map.md` and `docs//feature-map.md` are `docs/feature-map.md`.
The file is plain markdown, one section per feature:

```markdown
## Running one ticket

Reached by: `luca run` on a spec with one ticket.

Tests:
- `packages/engine/src/core/run-one-ticket.e2e.test.ts`
- `packages/engine/src/core/decide-build.test.ts`
```

`## Feature` is the feature's name, `Reached by:` says how a user gets to it,
and `Tests:` lists its test files. The engine reads only the backticked
paths: `featureMapFiles` in `gates/feature-map.ts` keeps each one that matches
`test_file_patterns`, once each (a leading `./` is dropped), so a backticked
source file in the prose is ignored.

**A folder map (#597).** One file can outgrow the file-size limit, so
`feature_map` may name a folder instead, one page per area:

```json
{ "checks": { "test": "bun test" }, "feature_map": "docs/feature-map" }
```

A path that doesn't end in `.md` is a folder (`isFeatureMapFolder`); the path
alone decides, so the guard and the prompts, which never read the disk, agree
with the red check. Every `*.md` page under the folder, nested ones too, read
in sorted order of their paths, together is the map: `readFeatureMap` in
`gates/feature-map.ts` joins their text and hands it to `featureMapFiles`, so a
test file listed on any page counts once. A missing or unreadable folder is the
same "is missing" problem as a missing file. The test-writer may write any
`*.md` page under the folder (`Edit(docs/feature-map/**/*.md)`), but not the
folder path itself or a file of another kind, and its instructions say to read
the pages first and to list a new test file on its area's page. A map path
ending in `.md` is one file, read exactly as before. So a map file must end in
`.md`: `loadEngineConfig` refuses a `feature_map` that doesn't but is a file
(`FEATURES`, `docs/map.txt`), naming the field, rather than treat it as a
folder.

- **The red check refuses an unlisted new test file.** A test file the ticket
  created (it is not in the ticket's base) must be listed, or the red check
  has the problem "src/new.test.ts: a new test file the feature map doesn't
  list (add it under a feature in docs/feature-map.md)", and the test-writer
  tries again. A test file the ticket only edited is never checked. A
  configured map that is missing or unreadable is a problem too, "The feature
  map docs/feature-map.md is missing: restore it, or add it with the new test
  file listed", not a crash; it is raised only when the ticket created a test
  file.
- **The test-writer may edit the map.** `mayWrite` and the test-writer's
  permission rules allow the map's path, besides test files, and its
  instructions say to read the map first, to put new tests in a feature's
  existing files when it can, and to list a new file under its feature. Its
  launch prompt, which says "Edit test files only", gets a "The feature map"
  section after it that names the map as the exception (`decideBuild` adds it
  to a test-writer's launches only). Nothing else changes for the other roles.
- **It is frozen on resume.** `feature_map` is in `FROZEN_FIELDS`, like
  `test_file_patterns`: a run keeps the map path it started with.
- Left out, nothing changes: no red-check problem, no extra write permission,
  and no lines in the test-writer's instructions.
