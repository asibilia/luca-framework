---
'@luca/engine': minor
---

An improved testing system (#584):

- **Slow tests.** A repo can name its slow tests in `checks.slow_test`. Each ticket runs only the fast tests (plus any slow test files the ticket adds or changes), and the final review runs the slow ones (#567).
- **Speed limit.** `test_case_timeout_ms` limits how long one fast test may take (#580).
- **Timings.** The journal records each gate check's time, the prepare wait, and each test's time and `expect()` count (#518).
- **Honest new tests.** The red check refuses more than 3 tests per criterion and any new test the map doesn't name. A mapped test that runs no `expect()` goes back to a fresh test-writer (#581).
- **Feature map.** `feature_map` names a markdown file listing each feature and its test files, and the red check refuses a new test file it doesn't list (#583).
