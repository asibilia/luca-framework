# Research: Obsidian Drop → Todo-Add → Autopilot

**Goal:** Drop files into an Obsidian vault folder → parse into Luca todo → post via todo-add semantics → run autopilot to refactor roadmap and work milestones autonomously.

---

## 1. What This Repo Already Provides

### todo-add (skill)

- **What it is:** A Cursor **skill** (instructions for the AI). It does not run as a standalone script.
- **Mechanics:** The agent is told to (1) extract/infer description and area, (2) check duplicates, (3) **create a file** at `.planning/todos/pending/{slug}.md` with specific frontmatter + body, (4) run **bridge snapshot** so STATE.md reflects the new todo.
- **Todo file format** (required for `parseSingleTodo` / `todoMetadataSchema`):
  - **Frontmatter:** `title`, `area`, `created` (ISO date), `source` (e.g. `conversation`, `obsidian-drop`).
  - **Body:** Free-form; skills often use `## Context`, `## Task`, `## Notes`.
- **Slug:** Lowercase, hyphenated, from title (e.g. quick.skill uses `tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | ... | cut -c1-40`).

So “posting a todo” **without** the Cursor UI = **write a valid `.planning/todos/pending/{slug}.md`** and run:

```bash
bun run packages/luca-state/src/bridge.ts snapshot
```

(from repo root; or equivalent if your Luca project lives elsewhere).

### autopilot (skill)

- **What it is:** A **meta-orchestrator** skill. It tells the AI to run sub-skills (phase-discuss, phase-plan, phase-execute, milestone-complete, etc.) and sub-agents (lu-cognition, lu-router, lu-pm-planner).
- **Invocation today:** Only via Cursor: user runs `/autopilot` (or `/lu` with “autopilot” / `--autopilot`). There is **no CLI in this repo** that runs the autopilot workflow; it’s prompt-driven inside the IDE.
- **Implication:** “Run autopilot after adding a todo” **cannot** be done by a simple shell script alone; it requires something that can trigger Cursor (or an equivalent LLM runner) to execute the autopilot skill.

### Existing code you can reuse

- **`src/planner/todo-parser.ts`** — `parseYamlFrontmatter`, `extractBody`, `parseSingleTodo`, `parseTodos`. Use this to validate and read todos.
- **`src/planner/types.ts`** — `todoMetadataSchema`, `TodoMetadata`. Use for the exact shape of a valid todo.
- **`packages/luca-state/src/bridge.ts`** — `snapshot` subcommand to refresh STATE.md after adding a todo.

---

## 2. Obsidian → “Todo added” (file watch + ingest script)

**Idea:** One folder in the vault is the “inbox”. When a file appears there, a watcher runs a script that (1) parses the file into a todo, (2) writes `.planning/todos/pending/{slug}.md`, (3) runs `bridge snapshot`.

### 2.1 Triggering on “file dropped” in Obsidian

- **Obsidian itself** doesn’t expose a “file dropped in folder X” API to arbitrary code. You need an external watcher or an Obsidian plugin.
- **Options:**
  1. **External file watcher** (e.g. `fswatch`, `chokidar`, or a small Bun script using `Bun.file` + polling or native APIs) on the **absolute path** of the inbox folder (e.g. `$OBSIDIAN_VAULT/Inbox` or `$OBSIDIAN_VAULT/Luca-Inbox`). On new file (or file change), run the ingest script.
  2. **obsidian-shellcommands** — run a shell command on Obsidian events; you could bind “when file created in folder X” (if the plugin supports it) to your script.
  3. **Custom Obsidian plugin** — on vault file create in a given folder, call Node/Bun or run a command. More work, full control.

Recommended: **external watcher** (Bun script or `fswatch`) pointing at the vault inbox path. No Obsidian plugin required; works even when Obsidian is closed.

### 2.2 Ingest script (Obsidian file → Luca todo)

- **Input:** Path to the dropped file (e.g. markdown or text).
- **Parse:**
  - **Option A (no LLM):** Use heuristics: first line or first `# ` as title, rest as body; `area: workflow` default; `source: obsidian-drop`; `created: today ISO`.
  - **Option B (with LLM):** Send file content to Claude (e.g. via Cursor MCP or API) with a small prompt: “From this note, extract: title, area (one of api|ui|auth|data|workflow|config|…), and body (Context / Task / Notes). Output structured.” Then build the todo from that.
- **Output:** Write one file to `.planning/todos/pending/{slug}.md` in the format expected by `todoMetadataSchema` and the existing skills (see existing pending todo example in repo).
- **Then:** Run `bun run packages/luca-state/src/bridge.ts snapshot` (from the Luca project root that contains `.planning/`).

You can implement this in this repo as e.g. `scripts/ingest-obsidian-to-todo.ts` (or a small package under `packages-dev/`), and call it from the file watcher with the path to the new Obsidian file. Use `todo-parser` + `todoMetadataSchema` to validate before writing.

---

## 3. After todo is added → “Run autopilot”

Autopilot is a **Cursor skill**, not a CLI. So:

- **Option A — Manual:** You (or the user) open Cursor and run `/autopilot` (or `/lu --autopilot`) after the ingest script has run. The new todo is already in `.planning/todos/pending/` and will be picked up by autopilot’s backlog scan (Step 1 in the autopilot skill).
- **Option B — Cursor Background Agent API:** If you have a Cursor session and the Background Agent MCP (or similar) that can “launch an agent” with a prompt, you could try launching with a prompt like “Run the autopilot skill: scan backlog, revise roadmap, and proceed with oversight level X.” That depends on Cursor exposing that API and the agent actually invoking the skill.
- **Option C — Replicate autopilot in a script:** The autopilot skill is a long orchestration prompt (read config, read STATE/ROADMAP, backlog scan, WSJF, roadmap revision, phase loop, etc.). Replicating it **outside** Cursor would mean reimplementing that flow in code and calling LLM + sub-agents yourself (e.g. via MCP or API). Large effort and duplicate logic.

**Practical recommendation:** Treat “add todo from Obsidian” as **automated** (file watch + ingest script), and “run autopilot” as **manual** (user runs `/autopilot` in Cursor when they want roadmap refactor and milestone work). Option B is worth exploring if you already use Background Agent / MCP and want a “one-click” trigger from outside Cursor.

---

## 4. Autonomously creating and working on milestones

- **Creating milestones:** The autopilot skill can call the **milestone-new** skill (and **milestone-complete**). So once autopilot is running in Cursor, it can create and complete milestones per its logic (and config like `cross_milestone`).
- **Working on milestones:** Autopilot drives phase-plan and phase-execute for phases on the roadmap; completion of phases/milestones is already part of the skill. No extra system needed for “create and work on milestones” beyond running autopilot (and having ROADMAP.md / STATE.md in a valid shape).

So: **autonomous milestones** = run `/autopilot` (or equivalent) with the desired oversight level; the rest is already in the skill.

---

## 5. Suggested implementation checklist

1. **Inbox folder**
   - Choose a folder in the Obsidian vault (e.g. `Luca-Inbox` or `Inbox`).

2. **Ingest script**
   - New script (e.g. `scripts/ingest-obsidian-to-todo.ts`):
     - Args: path to dropped file, optionally path to Luca project root (default `process.cwd()` or env).
     - Parse file (heuristic or LLM) → `title`, `area`, `created`, `source: obsidian-drop`, body.
     - Slug from title (same rules as quick.skill).
     - Write `.planning/todos/pending/{slug}.md` (create dir if needed).
     - Run `bun run packages/luca-state/src/bridge.ts snapshot` in project root.
   - Reuse `todoMetadataSchema` / `parseSingleTodo` for validation if you read back the file.

3. **File watcher**
   - Small Bun (or Node) watcher on the vault inbox path; on `add`/`change`, call the ingest script with the file path.
   - Optional: move or rename the file after ingest so it’s not re-ingested (e.g. move to `Processed/` or append `.done`).

4. **Autopilot**
   - Document: “After todos are added from Obsidian, run `/autopilot` in Cursor to refactor the roadmap and work on milestones.”
   - Optionally explore Cursor Background Agent / MCP to trigger that step from the same script (e.g. “notify user to run /autopilot” or “launch agent with autopilot prompt”).

5. **Optional: duplicate check**
   - Before writing, list `.planning/todos/pending/*.md`, parse with `parseTodos`, and compare title/slug; skip or warn if duplicate (mirrors todo-add skill behavior).

---

## 6. File paths and env

- **Luca project root:** Where `.planning/`, `packages/luca-state/`, etc. live. The ingest script and bridge must run from here (or you pass project root and `cd` there for the bridge).
- **Obsidian vault:** Can be on another path. The watcher needs the **absolute path** to the inbox folder (e.g. `$OBSIDIAN_VAULT/Luca-Inbox`). If the vault is inside the repo, you can use a relative path.

Example env (optional):

- `LUCA_PROJECT_ROOT` — path to the repo (default: cwd).
- `OBSIDIAN_VAULT_INBOX` — path to the vault inbox folder to watch.

---

## 7. References in this repo

- Todo format and schema: `src/planner/types.ts` (`todoMetadataSchema`), `src/planner/todo-parser.ts`.
- Example pending todo: `.planning/todos/pending/package-json-health.md`.
- todo-add skill: `.cursor/skills/todo-add/SKILL.md`, `src/skills/general/todo-add.skill.ts`.
- autopilot skill: `.cursor/skills/autopilot/SKILL.md` (backlog scan at Step 1, roadmap revision, milestone-new/milestone-complete).
- Bridge snapshot: `packages/luca-state/src/bridge.ts` subcommand `snapshot`.
- Slug style: `src/skills/general/quick.skill.ts` (slug generation in prompt).
