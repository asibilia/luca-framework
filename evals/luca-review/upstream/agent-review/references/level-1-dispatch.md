# Level 1 dispatch

Fill this in **before** dispatch. Search current-project history for similar failures; ask before searching another project. Name failure patterns, not transcript data or secrets, in the brief. If none is usable, name likely risks. Keep source inputs outside the worker's write scope, or digest them before and after.

```text
Task and scope: <outcome>
Sources: <paths/URLs and access>
Required method and hard stops: <method; conditions that stop the job>
Known failure modes: <patterns from current-project history, or likely risks>
Artifact: <named file or directory>
Directory identity: <manifest SHA-256>
Format and minimum size: <schema; byte floor for file or total deliverable-file bytes in a directory>
Verification command: <exact command chosen before dispatch>
Passing criteria: <substantive results, not existence or size alone>
Harness: <script/fixture/config paths and baseline SHA-256; or NONE (inline command)>
Write the artifact at the agreed path; serialize a non-file result to a file.
For a remote change, record it in a file and check actual remote state.
Run the command and report its output and limits. If a source, method,
hard stop, or check fails, name the blocker; label partial work.
Your final line must be exactly one of:
ARTIFACT-VERIFIED <lowercase SHA-256 of file or directory manifest>
ARTIFACT-MISSING: <nonblank reason>
```

For a directory, compute a **manifest hash** from its root with this exact recipe on both sides:

```sh
bash -c 'set -o pipefail; m=$(mktemp) && find . \( -name .git -o -path ./reviews \) -prune -o -type f -print0 | LC_ALL=C sort -z | xargs -0 -r sha256sum > "$m" && [ -s "$m" ] && sha256sum < "$m" | cut -d" " -f1; s=$?; rm -f "$m"; exit $s'
```

Use the digest only if the command succeeds; on Linux, `xargs -r` and `[ -s "$m" ]` make an empty tree fail, and the command cleans up its temporary file. It excludes `.git` at any depth and only the root `reviews/`, plus symlinks, file modes, and empty directories: a symlink target or permission can change without changing this hash, so check those, `.git` (hooks and config), and the root `reviews/` separately. Tested on Linux; on macOS, replace both `sha256sum` calls with `shasum -a 256` and rerun the failure cases. A tar archive can hash differently in another workspace despite identical file contents. Use the same recipe on both sides.

## Dispatcher acceptance

1. Confirm the agreed file or directory exists, meets its byte floor, and contains the required parts.
2. Check source and harness digests where used. If harness is `NONE`, confirm the frozen inline command.
3. Run the command yourself against the deliverable. Inspect enough content to catch a plausible substitute, and check remote state where relevant.
4. Recompute the file hash or directory manifest **with the same method** and compare the full value with the worker's final line.
5. Read the full report for failed gates, changed methods, and unverified parts.

Accept `ARTIFACT-VERIFIED` only if all five pass. A hash proves identity, not correctness. On failure, resolve the blocker or explicitly change the contract before redispatch. For the closing line, trim surrounding whitespace and Markdown fences/backticks/bold markers; lowercase only the digest before matching. Match `^ARTIFACT-VERIFIED [0-9a-f]{64}$` for the specified SHA-256, or `^ARTIFACT-MISSING:\s*\S.*$`. On Windows, `(Get-FileHash -Algorithm SHA256 <file>).Hash.ToLower()` hashes a file; use a consistent equivalent for a directory.
