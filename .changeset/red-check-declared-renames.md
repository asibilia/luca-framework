---
"@luca/engine": patch
---

The red check now accepts a test the ticket's owner lets the test-writer rename. A ticket declares its renames in a markdown table with the columns File, Old name, New name (under `## Renamed tests`, or any heading), one row per test or per `describe('...')`. Before, any old test renamed in place was `missing` and the ticket went stuck, even an approved one. Now a declared rename is judged under its new name: mapped to a criterion, it is a new test that must fail first; unmapped, it is an old test that must still pass. A rename the table doesn't name is still missing, and the problem now says only the table may rename a test. Intake refuses a malformed row (no name in backticks, the same old and new name, a repeated old or new name, or a describe mixed with a test name), naming the row and the fix. The test-writer's, implementer's and red check fix-loop instructions say the same.
