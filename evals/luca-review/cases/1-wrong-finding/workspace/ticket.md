# Ticket #530: /luca-unstick finds a repo's runs from a worktree

With no run id, `/luca-unstick` looks up runs by the git top folder. In a worktree, that is the worktree's own folder. But a run's repo is the main checkout, so it finds no runs.

## Acceptance criteria

- From a worktree, `stuck-summary.ts` with no run id lists the main checkout's runs.
- From a subfolder, or through a symlinked path, it lists the same runs.
- Outside git, it uses the folder itself, as before.
- `/luca-retro` looks repos up the same way.
- Tests cover a main checkout, a worktree, a subfolder, a symlink, and a non-git folder.
