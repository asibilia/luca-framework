# Complexity Gates

Which workflow steps activate at each complexity level.

```mermaid
flowchart LR
    subgraph Levels["Complexity Levels"]
        direction TB
        T["TRIVIAL"]
        S["SIMPLE"]
        M["MODERATE"]
        CO["COMPLEX"]
        CR["CRITICAL"]
    end

    subgraph Steps["Workflow Steps"]
        direction TB
        S1["Cognitive Pre-Flight"]
        S2["Research"]
        S3["Discussion"]
        S4["Plan Verification"]
        S5["Harness Fix Iterations"]
        S6["Verify Fix Iterations"]
        S7["Code Review"]
        S8["UAT"]
        S9["Learning Capture"]
    end

    T -->|"lite"| S1
    T -.->|"skip"| S2
    T -.->|"skip"| S3
    T -->|"0 iter"| S4
    T -->|"1 iter"| S5
    T -->|"0 iter"| S6
    T -.->|"skip"| S7
    T -.->|"skip"| S8
    T -.->|"skip"| S9

    CR -->|"full"| S1
    CR -->|"required"| S2
    CR -->|"required"| S3
    CR -->|"3 iter"| S4
    CR -->|"5 iter"| S5
    CR -->|"3 iter"| S6
    CR -->|"all reviewers"| S7
    CR -->|"required+thorough"| S8
    CR -->|"full+debrief"| S9

    style T fill:#2ecc71,color:#fff
    style S fill:#27ae60,color:#fff
    style M fill:#f39c12,color:#fff
    style CO fill:#e67e22,color:#fff
    style CR fill:#e74c3c,color:#fff
```

## Full Complexity Matrix

| Step                          | TRIVIAL | SIMPLE | MODERATE | COMPLEX  | CRITICAL          |
| ----------------------------- | ------- | ------ | -------- | -------- | ----------------- |
| Cognitive pre-flight          | Lite    | Lite   | Full     | Full     | Full              |
| Research                      | Skip    | Skip   | Optional | Required | Required          |
| Discussion                    | Skip    | Skip   | Optional | Run      | Required          |
| Plan verification             | 0 iter  | 0 iter | 1 iter   | 2 iter   | 3 iter            |
| Harness fix iterations        | 1       | 2      | 3        | 3        | 5                 |
| Verify fix iterations         | 0       | 1      | 1        | 2        | 3                 |
| Verification mode             | Quick   | Quick  | Standard | Full     | Full+Human        |
| Code review: dx-advocate      | Skip    | Skip   | Run      | Run      | Run               |
| Code review: code-simplifier  | Skip    | Skip   | Run      | Run      | Run               |
| Code review: code-architect   | Skip    | Skip   | Skip     | Run      | Run               |
| Code review: tailwind-auditor | Skip    | Skip   | If UI    | If UI    | Run               |
| Code review: security-auditor | Skip    | Skip   | If auth  | If auth  | Always            |
| UAT                           | Skip    | Skip   | Optional | Required | Required+Thorough |
| Learning capture              | Skip    | Brief  | Standard | Full     | Full+Debrief      |

## Behavioral Tiers

| Tier        | Levels            | Behavior                                                                                            |
| ----------- | ----------------- | --------------------------------------------------------------------------------------------------- |
| Lightweight | TRIVIAL, SIMPLE   | Minimal overhead. Skip research, discussion, code review, UAT. Fast iteration.                      |
| Standard    | MODERATE          | Balanced. Optional research/discussion, standard verification, basic code review.                   |
| Thorough    | COMPLEX, CRITICAL | Maximum rigor. Required research, discussion, full verification, all reviewers, UAT, full learning. |

## Override Mechanisms

- `--complexity=<level>` — Explicit level, skips router inference
- `--force-complex` — Alias for `--complexity=COMPLEX`
- `workflow.code_review: false` — Skip code review regardless of complexity
- `workflow.uat_required: false` — Skip UAT regardless of complexity
- `--skip-review`, `--skip-uat` — Per-invocation skip flags

Config booleans and per-invocation flags take precedence over complexity gating.
