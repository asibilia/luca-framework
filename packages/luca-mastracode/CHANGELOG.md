# @alecsibilia/luca-mastracode

## 10.4.0

### Minor Changes

- 7dca589: Add Confidence Journal to the execute step

  Introduces a running confidence journal that tracks decision-making certainty during execution. When an executor encounters ambiguity, makes on-the-fly decisions, or lacks sufficient plan detail, it logs a structured entry with a confidence score, category, alternatives considered, and risk assessment.
  - New backing module (`confidence-journal.ts`) with append-only JSONL storage and Markdown rendering
  - New `confidenceJournal` tool with actions: `log`, `read`, `summary`, `render`
  - Execute mode has full access; Review gets `read`/`summary`; Finalize gets `read`/`summary`/`render`
  - Executor subagent instructions updated with confidence logging guidelines
  - Execute mode instructions updated with when/how to log and Learn step integration
  - Review mode now loads the journal and prioritizes review of low-confidence areas
  - Human-readable `.planning/CONFIDENCE-JOURNAL.md` auto-generated with summary table and grouped entries
