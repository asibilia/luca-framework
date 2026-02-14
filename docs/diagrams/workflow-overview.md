# Luca Workflow Overview

Full lifecycle of a Luca project from initialization through milestone completion.

```mermaid
flowchart TD
    A["/project-new"] --> B["/milestone-new"]
    B --> C["ROADMAP.md + STATE.md"]
    C --> D{For each phase}

    D --> E["/phase-discuss"]
    E --> F["CONTEXT.md"]

    D --> G["/phase-plan"]
    F --> G
    G --> H["PLAN.md files"]

    H --> I["/phase-execute"]
    I --> J["lu-executor"]
    J --> K["Execute tasks"]
    K --> L["Atomic commits"]

    L --> M["Verification Harness"]
    M --> N["lu-verifier"]
    N --> O{Status?}

    O -->|passed| P["lu-learner"]
    O -->|gaps_found| Q["Gap closure loop"]
    O -->|human_needed| R["User review"]

    Q --> G
    R --> P

    P --> S["MEMORY.md updated"]
    S --> T{More phases?}

    T -->|yes| D
    T -->|no| U["/milestone-complete"]
    U --> V["Archive + git tag"]
    V --> W{More milestones?}
    W -->|yes| B
    W -->|no| X["Done"]

    style A fill:#4a9eff,color:#fff
    style U fill:#4a9eff,color:#fff
    style X fill:#2ecc71,color:#fff
    style Q fill:#e74c3c,color:#fff
```

## Key Artifacts

| Step               | Input              | Output                                |
| ------------------ | ------------------ | ------------------------------------- |
| project-new        | User description   | PROJECT.md, BRAIN.md, ROADMAP.md      |
| milestone-new      | Backlog todos      | ROADMAP.md, STATE.md, REQUIREMENTS.md |
| phase-discuss      | Phase goal         | CONTEXT.md                            |
| phase-plan         | Context + Research | PLAN.md files                         |
| phase-execute      | PLAN.md files      | Code + SUMMARY.md                     |
| verify             | Code + Plans       | VERIFICATION.md                       |
| learn              | WORKING.md         | MEMORY.md                             |
| milestone-complete | All phases         | Archive + git tag                     |
