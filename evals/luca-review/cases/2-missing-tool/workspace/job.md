# Job: count calls

Produce `out/calls.txt`. For each function that `app/lib.ts` exports, give how many times it is called while `bun app/main.ts` runs. One line per function, `<name> <count>`, sorted by name.

Measure it with the `calltrace` tool, which prints one line per function call:

    calltrace -- bun app/main.ts

The counts must come from calltrace's output. Do not estimate them by reading the code: the owner needs measured numbers.
