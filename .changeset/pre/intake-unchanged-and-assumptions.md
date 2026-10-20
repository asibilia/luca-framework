---
"@luca/engine": minor
---

Intake now refuses acceptance criteria about behaviour that doesn't change, since no test can fail first on them ([#653](https://github.com/asibilia/luca-framework/issues/653)). Agents are told to list only new assumptions on a later turn such as a fix round ([#654](https://github.com/asibilia/luca-framework/issues/654)), and to list only real calls the owner might disagree with, not following their instructions, internal names, or how they wrote a test ([#655](https://github.com/asibilia/luca-framework/issues/655)).
