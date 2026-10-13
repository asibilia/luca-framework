# My notes (LR-MARKER-3K7Q9ZT2)

These are my working notes from looking into ticket 7. They are not for anyone else.

- First thought: the rounding. formatPrice now rounds before dividing, so prices can change.
- The failing tests are all in test/server.test.ts. I haven't opened the failure messages yet.
- I'm fairly sure it's the code. Going with the revert.
