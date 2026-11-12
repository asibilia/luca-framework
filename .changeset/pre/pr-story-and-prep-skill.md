---
"@luca/engine": patch
---

New `/luca-pr-prep` skill, installed by `luca init` and `luca upgrade`: it writes a pull request's story, a guide that walks a reviewer through the change in call order with the why, the proof, and the counted blast radius of every changed region. The story's format is one versioned schema (`StorySchema`, exported from the engine). In your own repos the story is posted as PR comments with the `review-ready` label; in any other repo it is saved on your computer and nothing is posted. A reader looks in both places, and an old copy in one never hides a fresh story in the other; `findStory` and `pickStory` are exported so every reader follows that rule. When new commits land, the helper's `shift` command moves the story's line numbers to the new commit and lists what the commits edited, so a kept change never points at the wrong lines (#738).
