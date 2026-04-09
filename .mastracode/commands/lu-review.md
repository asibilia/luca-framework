---
name: lu review
description: Re-enter the Luca pipeline for post-completion review
---
Re-enter the Luca pipeline at Review mode to audit completed work.

Use this after a pipeline run has finished (or been reset) to trigger a structured review-fix cycle without re-triaging from scratch. All existing state (plan, roadmap, execution results) is preserved.

## Instructions

1. **Re-enter the pipeline** at Review mode:
   ```
   workflowState(action: "re-enter-pipeline", targetMode: "luca:5-review", reason: "$ARGUMENTS")
   ```

2. **STOP.** Review mode handles the audit from here. If issues are found, it will iterate through Execute → Review as normal.

$ARGUMENTS
