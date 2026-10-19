# @luca/engine: leftovers, commits, and changesets

This page goes on from [The prepare command](prepare-and-tests.md) and
[Test limits and slow tests](test-commands-and-limits.md).

**Files prepare makes stay out of the ticket (#486).** A build can leave
files the repo's `.gitignore` misses. HeartGold's prepare links its vendor
tools in as symlinks to folders, and its `.gitignore` names those paths as
folders (`decomp/tools/bin/`). Git sees a symlink as a file, so the folder
pattern misses it and the link shows up as untracked. Such paths are not an
agent's work. Each time the engine runs prepare, it lists the untracked
paths before and after. The new ones are journaled as
`prepare_made { paths }`, right after that prepare run. From then on, in
every checkout of the run, the engine leaves those paths out of the
ticket's changes: the leftover scan skips them, no commit takes them (not
even the changeset's), and the guard never judges an agent by them, so an
agent that runs the build itself isn't blamed for what it rewrote. The
engine does not write them into `.git/info/exclude`: a ticket's worktree
shares that file with your own checkout, so it would hide them there too.

**Links that point outside the checkout are never committed (#496).** A
run started on an older engine (14.0.0-alpha.1 or before) never noted what
prepare made. Resumed on a newer engine, its worktrees may still hold
prepare's links, and prepare won't make them again, so the engine can't see
them appear. So before every commit (and at the red check), the engine
looks at each untracked symlink. One whose target is outside the checkout
only works on one machine, so no commit may hold it. The engine leaves it
out, like what prepare made, and journals it once as
`prepare_made { paths, outside_links: true }`. The link stays in the
worktree, untracked. The ticket doesn't get stuck on it, since such links
are almost always prepare's.

Three limits. Only untracked paths count: a tracked file prepare changes
still shows as the ticket's change. If the engine crashes in the middle
of a prepare run, the redo can't tell what the first try already made, so
those paths count as the ticket's unless an earlier prepare run already
noted them. And on a run from an older engine, only outside-pointing links
are caught: other files its prepare made still count as the ticket's.

**Nothing to commit never crashes the run (#494).** When prepare made every
change in a worktree, there is nothing left to commit, and `git commit`
would fail. So the engine never runs it then. At the red check, a
test-writer turn that changed no file is one more red check problem ("No
file changed, so the red commit would be empty"), for the test-writer's fix
loop. At any other commit (green, a review fix round, the final review),
the engine journals the current commit as `commit_made` with no files and
moves on. A green stage can be empty that way when a rebase finds the
ticket's change already on the run branch.

An odd path in a worktree never crashes the run. The engine reads a
changed path as git stores it: a symlink as its target (never followed), a
folder as no text. A folder with its own git repo in it, which git can't
commit as files, is a leftover scan hit, so the ticket gets stuck with that
reason.

**Files a tool loads by name are not "unused" (#507).** The leftover scan's
"a new script or module that nothing uses" skips files a tool or framework
loads by their name or folder, so nothing imports them: `*.config.{ts,js,mjs,cjs,mts,cts}`
(vite, vitest, eslint, tailwind, postcss, react-router, astro, next...),
`entry.server.*` and `entry.client.*`, `root.*`, `routes.*`, `middleware.*`,
and any file under `app/routes/`, `pages/`, `src/app/`, or `src/pages/`, at
any depth. The allowlist is `LOADED_BY_NAME` and `ROUTER_FOLDER` in
`src/gates/leftover-scan.ts`.

**A file the repo names is neither unused nor scratch (#507).** Before the
scan, the engine looks for each scratch-named file (`debug.*`, `notes.*`,
`tmp.*`, ...) by its basename in the tracked files (`git grep`, the
worktree's text) and in the files the same change adds. If such a file
other than itself and the tests names it, as an addon's TOC (tracked, or
new in the same ticket) lists `core\debug.lua`, a `package.json` script
runs `tools/notes.ts`, or a config points at it, it is the repo's: never "a
scratch file". A mention in a test alone doesn't count, so a stray `tmp.ts`
a test names is still flagged as scratch, like a `notes.md` or `scratch.ts`
nothing names. A new code file needs no such look: "nothing uses it" already
searches for its name without the extension, which a file naming it holds,
so a file the repo names is never "unused".

**Docs the repo asks for pass (#520).** A new markdown file the spec and
ticket don't name is still let through when it is a `README.md`, sits under
a `docs` or `adr` folder at any depth, is named by a tracked or newly added
non-test file (the same look as for scratch-named files, so an index or a
table of contents counts), or matches a glob pattern in the config's
optional `leftover_allow`:

```json
{ "checks": { "test": "bun test" }, "leftover_allow": ["handbook/**/*.md"] }
```

Stray markdown next to code, such as `src/plan.md`, is still flagged. The
`leftover_scan` record lists each file let through in `passed: [{ path,
reason }]`, with `reason` `doc_place`, `named_by_repo`, or
`config_pattern`; it is left out when none was.

**Agents don't write changesets (#507).** In a repo with changesets
(`.changeset/config.json` when the run branch was made), the engine writes
the run's one changeset at PR time. So the test-writers' and implementers'
prompts (the final review's fixers too) say not to write one, even if the
repo's rules ask for it, and the rules lens is told the engine adds it.
One an agent writes anyway, a new `.changeset/*.md` other than
`.changeset/README.md`, is removed from the worktree before the leftover
scan and journaled as `changeset_dropped { paths }` (no ticket at the final
review's fix commit). It is no leftover hit, so the ticket moves on. Edits to
`.changeset/config.json`, `pre.json`, or the README are the agent's work and
are committed as usual.
