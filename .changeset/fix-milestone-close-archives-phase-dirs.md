---
"@alecsibilia/luca": patch
---

Fix `milestone-complete` never archiving phase directories — prior-milestone phase dirs piled up in `.luca/phases/` and collided on phase number (e.g. several `01-*` dirs) with the next milestone's roadmap, violating the planning-structure contract. The skill only snapshotted roadmap/audit/backlog files to `.luca/milestones/`; the `archivedPhasePathFor` helper existed but nothing used it. New `luca phase archive` moves every `.luca/phases/<slug>/` → `.luca/archive/<slug>/` (idempotent — skips a slug already frozen under archive/, never overwrites), and `milestone-complete` now runs it during the close, before the workflow reset and next-milestone roadmap.
