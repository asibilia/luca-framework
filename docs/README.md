# Luca documentation

Start with `GLOSSARY.md` for the domain words, then read the README of the package you're working in.

| Doc | What it covers |
| --- | --- |
| [../GLOSSARY.md](../GLOSSARY.md) | The domain words: spec, ticket, run, engine, gate, journal, board, and the rest |
| [../packages/engine/README.md](../packages/engine/README.md) | The engine: how a run moves, crash recovery, reviews, stuck work, the `luca-run` command line, memory, tests |
| [../packages/board/README.md](../packages/board/README.md) | The board, the Paseo plugin `luca-board`: `/luca-run`, the `engine.event` contract, settings, install, develop |
| [agents/](agents/) | How agents use this repo: the [issue tracker](agents/issue-tracker.md), [triage labels](agents/triage-labels.md), and [domain docs](agents/domain.md) |
| [feature-map/](feature-map/index.md) | The features a user would recognise, how a user reaches each, and the test files that cover it, one page per area. The red check refuses a new test file no page lists (#583, #597) |
| [guides/coding-standards.md](guides/coding-standards.md) | Coding standards. One of the engine's rule files in `.luca/config.json` |
| [migrating-to-v14.md](migrating-to-v14.md) | For v13 users: what's gone, what replaced it, and `luca doctor --fix` |

## Old Luca

Old Luca's docs (getting started, troubleshooting, design records, research, and the archive) were removed with old Luca. They are at the tag `old-luca-final`. To read one, run:

```bash
git show old-luca-final:docs/<path>
```

---

_Update this index when adding or moving docs._
