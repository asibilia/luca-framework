# Why ticket 7's gates failed

Ticket 7 ("Round prices to whole cents in formatPrice") went stuck with `join_gates_failed` after three fix rounds.

**Cause.** The change in `src/format.ts` broke the server tests. After it, 6 tests in `test/server.test.ts` fail; before it, they passed. The failing tests all serve prices, so the new rounding must change what the server returns.

**Fix.** Revert the rounding change in `formatPrice`, and send the ticket back to the test-writer.
