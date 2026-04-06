---
name: lu
description: Start the Luca autonomous development workflow
---
Start the Luca development pipeline. Your ONLY job is to switch to Triage mode with the user's request.

## Instructions

1. **Switch to Triage mode** — pass the full user request (including any todo references) as the userRequest:
   ```
   workflowState(action: "switch-mode", targetMode: "triage", userRequest: "$ARGUMENTS")
   ```

2. **STOP.** Do not classify, plan, research, assign todos, or implement. Triage mode handles everything from here — including todo assignment if the request references specific todos.

$ARGUMENTS
