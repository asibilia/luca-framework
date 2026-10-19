# @luca/engine: modules in `src/gates/`

The red check, the gates, installs, and the leftover scan. A module in another
folder is on its folder's page; the [README](../README.md) lists them.

| Module | What it does |
| --- | --- |
| `src/gates/already-done-check.ts` | Pure: the check of a test-writer's `already_done` evidence (#495). Each commit is on the base, each criterion names a test, and each named test exists, is as it is on the base, and passes there. |
| `src/gates/test-runner.ts` | Runs the config's `bun` test commands with bun's JUnit reporter. |
| `src/gates/red-check.ts` | The **red check**. Pure. At most `MAX_TESTS_PER_CRITERION` tests per criterion, every new test mapped (#581), and every new test file in the feature map (#583). |
| `src/gates/new-tests.ts` | Pure: the test names in a test file's text (`testNamesIn`), and the ones a change added (`addedTestNames`, #581). |
| `src/gates/feature-map.ts` | Pure: the test files a repo's feature map lists (`featureMapFiles`, #583). |
| `src/gates/gate-runner.ts` | Runs the config's **gates**: each test command, types, lint. First, the install when a manifest changed. |
| `src/gates/prepare-slots.ts` | Lets only so many prepare runs go at once (`prepare_concurrency`, 1 by default); the rest wait their turn. |
| `src/gates/lockfile-install.ts` | Which install to run: in a new worktree, or before the gates when a manifest changed. Pure. |
| `src/gates/leftover-scan.ts` | The **leftover scan**. Pure. |
