---
"@alecsibilia/luca": patch
---

Ship the `caveman` skill (ultra-compressed communication mode, ~75% fewer tokens). Seven v13 pipeline modes (triage, research, architect, execute, review, finalize, fast) instruct the agent to "activate the `caveman` skill", but the skill was dropped in the Phase D/E mastracode→luca-tools port and never shipped — so those references dangled and the token savings never applied on a fresh install. The skill is now ported into the luca-tools artifact set and registered in the manifest (skills 41→42). The companion mastracode `caveman` rule is intentionally not ported: v13 has no Claude Code rule-delivery target, and the modes invoke the skill directly. (Audit note: mastracode shipped only two rules — `caveman` and `pr-title-format`; the latter is superseded by the v13 preferences system + gh-prepare/gh-pr-address skills and used the removed `projectPreferences` tool, so it was not re-ported.)
