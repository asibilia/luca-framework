# @luca/engine: modules in `src/gates/`

The red check, the gates, installs, and the leftover scan. A module in another
folder is on its folder's page; the [README](../README.md) lists them.

| Module | What it does |
| --- | --- |
| `src/gates/already-done-check.ts` | Pure: the check of a test-writer's `already_done` evidence (#495). Each commit is on the base, each criterion names a test, and each named test exists, is as it is on the base, and passes there. |
| `src/gates/test-runner.ts` | Runs the config's `bun` test commands with bun's JUnit reporter. |
| `src/gates/junit-runner.ts` | Runs a `junit` test command (#668) as written and reads the JUnit files in its `junit_path` (`runJunitTests`). |
| `src/gates/swift-test-index.ts` | Ties a SwiftPM JUnit case to the `.swift` file that declares it, and counts its assertions (`swiftTestIndex`, #668). |
| `src/gates/case-test-runner.ts` | Runs the test commands with per-test results, `bun` and `junit` (#668), in order and joined into one run (`runCaseTests`): for the baseline, the red check and the already-done check. |
| `src/gates/red-check.ts` | The **red check**. Pure. At most `MAX_TESTS_PER_CRITERION` tests per criterion, every new test mapped (#581), a moved test counted as old (#609), every new test file in the feature map (#583), and a `.swift` file whose tests don't build yet read from its text (#668). |
| `src/gates/new-tests.ts` | Pure: the test names in a test file's text (`testNamesIn`), and the ones a change added (`addedTestNames`, #581). |
| `src/gates/swift-test-names.ts` | Pure: the test names in a `.swift` file's text (`swiftTestNamesIn`, #668), as SwiftPM prints them. |
| `src/gates/feature-map.ts` | Pure: the test files a repo's feature map lists (`featureMapFiles`, #583). |
| `src/gates/gate-runner.ts` | Runs the config's **gates**: each test command, types, lint. First, the install when a manifest changed. It keeps `runGates` and re-exports `shellCheck`, `prepareCheck`, `runSlowTests`, and `FAST_TEST_HINT`, which live in the modules below. |
| `src/gates/shell-check.ts` | Runs one shell command as a named gate check (`shellCheck`), and the clock the checks share (`msSince`). |
| `src/gates/prepare-check.ts` | The `prepare` check: the config's prepare command, one at a time per `prepare_concurrency`, with the wait as `wait_ms`. |
| `src/gates/test-checks.ts` | The test commands as gate checks (`testChecks`): `pass_fail` commands by exit code, `bun` commands with the JUnit reporter, `junit` commands through the junit runner with no `--timeout` (#668), each in a test slot, held to the fast test speed limit (#580). |
| `src/gates/own-files-check.ts` | A ticket's own test files that no fast run gave results for, run on their own as one more `test` check (#564). |
| `src/gates/slow-test-runner.ts` | The final review's slow tests (#563): the prepare command, then each slow test command (`runSlowTests`). |
| `src/gates/prepare-slots.ts` | Lets only so many prepare runs go at once (`prepare_concurrency`, 1 by default); the rest wait their turn. Also holds `createSlots`, which the test slots use too; an exclusive take waits until no work holds a slot. |
| `src/gates/test-slots.ts` | The **test slots** (#544): lets only so many test runs go at once (`test_concurrency`, no cap by default), and records the wait as `wait_ms`. |
| `src/gates/lockfile-install.ts` | Which install to run: in a new worktree, or before the gates when a manifest changed. Pure. |
| `src/gates/leftover-scan.ts` | The **leftover scan**. Pure. |
