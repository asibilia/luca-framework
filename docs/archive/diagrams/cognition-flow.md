# Cognition Flow

Two-tier memory system: project identity, long-term learning, and session memory.

```mermaid
flowchart TD
    subgraph Identity["Project Identity (Permanent)"]
        B["MuninnDB brain tree"]
        B1["Stack & frameworks"]
        B2["Architecture patterns"]
        B3["Code conventions"]
        B4["Dev preferences"]
        B --> B1
        B --> B2
        B --> B3
        B --> B4
    end

    subgraph LongTerm["Long-Term Memory (Persistent)"]
        M["MuninnDB engrams"]
        M1["Patterns (validated approaches)"]
        M2["Decisions (past choices + rationale)"]
        M3["Pitfalls (known issues to avoid)"]
        M4["Preferences (user/project prefs)"]
        M --> M1
        M --> M2
        M --> M3
        M --> M4
    end

    subgraph Session["Session Memory (Ephemeral)"]
        W["MuninnDB session context"]
        W1["Current task context"]
        W2["Findings & observations"]
        W3["Candidate learnings"]
        W4["Hypotheses (debugging)"]
        W --> W1
        W --> W2
        W --> W3
        W --> W4
    end

    subgraph PreFlight["Cognitive Pre-Flight"]
        PF1["1. Load MuninnDB brain tree"]
        PF2["2. Selective recall from MuninnDB engrams"]
        PF3["3. Initialize MuninnDB session context"]
        PF4["4. Generate intuition flags"]
        PF1 --> PF2 --> PF3 --> PF4
    end

    subgraph Flags["Intuition Flags"]
        F1["RISK - Past failures in similar areas"]
        F2["CAUTION - Complexity or integration issues"]
        F3["OPPORTUNITY - Strong patterns to follow"]
        F4["UNKNOWN - No prior experience"]
    end

    PF4 --> F1
    PF4 --> F2
    PF4 --> F3
    PF4 --> F4

    subgraph Learning["Learning Extraction"]
        L1["lu-verifier passes"]
        L2["lu-learner spawned"]
        L3["Extract validated learnings"]
        L4["Graduate to MuninnDB engrams"]
        L1 --> L2 --> L3 --> L4
    end

    B -.->|"loaded at session start"| PF1
    M -.->|"selectively recalled"| PF2
    W -.->|"candidate learnings"| L3
    L4 -.->|"validated insights"| M

    style B fill:#e74c3c,color:#fff
    style M fill:#f39c12,color:#fff
    style W fill:#2ecc71,color:#fff
```

## Memory Tiers

| Tier      | File                     | Scope                   | Lifetime   | Updated By               |
| --------- | ------------------------ | ----------------------- | ---------- | ------------------------ |
| Identity  | MuninnDB brain tree      | Project conventions     | Permanent  | /project-new, user edits |
| Long-Term | MuninnDB engrams         | Cross-session learnings | Persistent | lu-learner (validated)   |
| Session   | MuninnDB session context | Current session context | Ephemeral  | lu-executor, lu-verifier |

## Data Flow

1. **Session Start**: lu-cognition runs pre-flight — loads MuninnDB brain tree, recalls relevant MuninnDB engrams entries, initializes MuninnDB session context
2. **During Execution**: lu-executor logs findings, observations, and candidate learnings to MuninnDB session context
3. **After Verification**: lu-learner extracts validated insights from MuninnDB session context → graduates to MuninnDB engrams
4. **At Milestone**: MuninnDB engrams snapshot archived, MuninnDB session context cleared for next milestone
