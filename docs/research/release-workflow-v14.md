# What the old Release workflow needs to publish v14

Question (#442, map #438): the old Release workflow at the tag `old-luca-final` published `@alecsibilia/luca` with changesets and npm trusted publishing (OIDC, no token). What must change for it to publish v14? This covers: one package instead of the old fixed group of four, changesets' pre mode, publishing `14.0.0-alpha.N` under `alpha` while `latest` stays `13.0.1`, whether the npm trusted-publisher link still points here, and current action versions.

Checked on 2026-09-26. Sources: the old files (`git show old-luca-final:<path>`), the npm registry (read-only `npm view` and the public attestations endpoint), this repo's GitHub settings (read-only `gh api`), the release notes, `action.yml`, READMEs, and source of each action and of changesets, and npm's and GitHub's docs. Nothing was published, tagged, or changed on npm or GitHub.

I also ran `@changesets/cli` 3.0.3 and 2.31.1 in throwaway Bun workspaces under `/tmp` to check the version numbers. They were not in this repo and published nothing.

## Short answer

The old workflow's shape still works: changesets opens a Version PR, and merging it publishes with `bun pm pack` then `npm publish` over OIDC. But much of what it runs on has moved since July. Three changes are required. The rest are small fixes.

1. **changesets moved a major version.** `@changesets/cli` is now 3.0.3, and `changesets/action` v2 needs it. v2 no longer reads the `New tag:` line that `create-release.ts` printed, so with v2 as written the publish job would never run. Either stay on `changesets/action@v1` with CLI 2.x (smallest change, but v1 is the old line), or move to v2 + CLI 3 and split the jobs the way the changesets docs now show. **I recommend v2 + CLI 3**, using its `select-mode` and `version` sub-actions, and keeping our own Bun pack + `npm publish` job.
2. **One package, fresh pre mode.** Drop the `fixed` group (three of its four packages are gone). Don't bring back the old `.changeset/` folder. Start pre mode fresh with `changeset pre enter alpha`. The package's `package.json` must say **`13.0.1`** before the first `major` changeset. Then the first version is `14.0.0-alpha.0` (checked). If it says `13.1.0-alpha.0`, the first version is `14.0.0-alpha.1` (checked).
3. **Guard `latest`.** Keep `--tag alpha` on every publish. Add a hard stop: the publish job fails if the version is not a prerelease. Otherwise one `changeset pre exit` would publish `14.0.0` to `latest`.

The npm link looks intact from here. The last publish (`13.1.0-alpha.0`, 2026-07-17) went through trusted publishing from this repo's `.github/workflows/release.yml` on `main`. The `npm-publish` environment still exists and still allows only `main`. **Keep the file name `release.yml` and `environment: npm-publish`.** npm doesn't let you edit a trusted-publisher link. Renaming means deleting and remaking it, and a link made after 2026-09-03 blocks `npm publish` by default. Only Alec can see the npm-side settings.

## What changes, piece by piece

| Piece | Old (`old-luca-final`) | For v14 | Why |
| --- | --- | --- | --- |
| `actions/checkout` | `@v4` | `@v7` (v7.0.1) | Current. Runs on node24 |
| `actions/setup-node` | `@v4`, Node 24, no `registry-url` | `@v7`, Node 24, still no `registry-url` | Node 24.21.0 ships npm 11.19.0. Trusted publishing needs npm 11.5.1 or newer. The runner's own npm is 10.9.8 |
| `oven-sh/setup-bun` | `@v2`, Bun `1.3` | `@v2` (= v2.2.0). Pin Bun to what the repo uses | Current. Bun 1.4.2 is out, and the repo is on 1.3.11 locally |
| `changesets/action` | `@v1` (a branch), camelCase inputs | `select-mode@v2.1.2` + `version@v2.1.2` | v2 renames inputs and changes how "published" is found. See below |
| `@changesets/cli` | `^2.31.0` | `^3.0.3` | action v2 refuses CLI 2 |
| `.changeset/config.json` | `fixed` group of 4, schema `config@3.1.4` | No `fixed`. Schema `@changesets/config@4` | 3 of the 4 packages are gone. Private packages aren't versioned by default in CLI 3 |
| `.changeset/pre.json` | CLI 2 format, `initialVersions` at 13.0.1 | Fresh `pre enter alpha` (CLI 3 format: `{ "mode": "pre", "tag": "alpha" }`) | Old file names deleted packages |
| `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` env | Set | Remove | Node 20 is gone from runners as of 2026-09-23 |
| Publish trigger | `published` output from the `New tag:` stdout line | `select-mode` output `mode == 'publish'` | v2 reads a `CHANGESETS_OUTPUT` file, not stdout |
| Pack | `bun pm pack` | Keep `bun pm pack` | changesets' own pack uses `npm pack` in a Bun repo, which leaves `catalog:` in the manifest (checked) |
| Publish | `npm publish <tgz> --access public --provenance --tag <computed>` | Same, plus a guard that the version is `X-alpha.N` | `bun publish` still has no OIDC (oven-sh/bun#22423 is open). npm 11+ needs `--tag` for prereleases |
| `create-release.ts` | `gh release create v<version>`, prints `New tag:` | Add `--prerelease`. Drop the `New tag:` line | `v13.1.0-alpha.0` shows as GitHub's "Latest" release today because it wasn't marked prerelease |
| `compute-release-title.ts` | `changeset status --output` | Works as is with CLI 3 | Same `releases[].name/newVersion` shape. The action adds ` (alpha)` itself |
| Checks before publish | `tsc --noEmit` only | Whatever #449 picks | The map says the release job re-runs the checks |

## Details

### 1. Actions and tools today

| Thing | Latest | Released | Runtime |
| --- | --- | --- | --- |
| `actions/checkout` | v7.0.1 | 2026-07-20 | node24 |
| `actions/setup-node` | v7.0.0 | 2026-07-14 | node24 |
| `oven-sh/setup-bun` | v2.2.0 (`v2` tag points to the same commit) | 2026-03-14 | node24 |
| `changesets/action` | v2.1.2 (`v2` is a branch, like `v1` was) | 2026-09-07 | node24 |
| `changesets/action` v1 line | v1.9.0 | 2026-06-03 | node24 |
| `@changesets/cli` | 3.0.3 (2.x ends at 2.31.1) | 2026-09-14 | needs Node `^22.11 \|\| ^24 \|\| >=26` |
| npm | 12.1.0 (`latest`). Node 24.21.0 bundles 11.19.0 | | npm 12 needs Node `^22.22.2 \|\| ^24.15.0 \|\| >=26` |
| Bun | 1.4.2 | | |

- Release lists and dates: `gh api repos/<owner>/<repo>/releases`. Runtimes: each action's `action.yml` at that tag.
- Node/npm pairs: `https://nodejs.org/dist/index.json` (v24.21.0 → npm 11.19.0; v22.23.3 → npm 10.9.9).
- `ubuntu-latest` is Ubuntu 24.04, with Node 22.23.2 and npm 10.9.8 installed ([runner-images README](https://github.com/actions/runner-images/blob/main/README.md), [Ubuntu 24.04 readme](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md)). So the runner's npm is too old for trusted publishing, and `setup-node` with Node 24 is still needed in the publish job.
- Node 20 is gone from runners, and the opt-out is gone too ([GitHub changelog, 2026-09-23](https://github.blog/changelog/2026-09-23-node-20-is-no-longer-available-in-github-actions/)). The old workflow's `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` line does nothing now. (Its comment expected removal on 2026-09-16. It came on 2026-09-23.)
- npm 12 isn't needed. The npm bundled with Node 24 clears every floor here. npm 12 also turns unknown flags into errors ([npm v12.0.0 notes](https://github.com/npm/cli/releases/tag/v12.0.0)). The old publish flags are all known ones.

### 2. changesets: what broke between July and now

`changesets/action` v2.0.0 (2026-08-11) and `@changesets/cli` 3.0.0 (2026-08-11) both shipped breaking changes. The ones that touch the old workflow:

**Action v2** ([v2.0.0 notes](https://github.com/changesets/action/releases/tag/v2.0.0), [`action.yml` @ v2.1.2](https://github.com/changesets/action/blob/v2.1.2/action.yml), [`src/index.ts`](https://github.com/changesets/action/blob/v2.1.2/src/index.ts), [`src/run.ts`](https://github.com/changesets/action/blob/v2.1.2/src/run.ts)):

- **Needs CLI 3.** It throws if the root `package.json` declares `@changesets/cli` 2.x, and sends CLI 2 users back to `@v1` (`validateChangesetsCliVersion` in `src/utils.ts`).
- **Inputs renamed to kebab-case.** `version` → `version-script`, `publish` → `publish-script`, `commit` → `commit-message`, `title` → `pr-title`, `createGithubReleases` → `create-github-releases`. The old camelCase names throw an error. `commitMode` is gone. Pushing through the GitHub API (signed commits) is now the default. `push-with-git-cli: true` switches back to git.
- **Token.** Pass a custom token only through `github-token`. The action throws if the `GITHUB_TOKEN` env var is set and differs from the input. The old step set `GITHUB_TOKEN` in `env`, which is the same token as the default, so remove it to be safe.
- **"published" no longer comes from stdout.** v1 looked for `New tag: <name>@<version>` lines. That's why the old `create-release.ts` printed one without publishing anything. v2 sets `published` only from `git-tag` events in an NDJSON file whose path it passes as `CHANGESETS_OUTPUT`. A custom publish script that never calls the changesets CLI gets a warning, and `published` stays `false` (`runPublish` in `src/run.ts`). **So the old wiring, moved to v2 as is, never runs the publish job.**
- **`create-github-releases: false` no longer means "no git tags".** The new `push-git-tags` input defaults to `true`.
- **Output renamed:** `pullRequestNumber` → `pr-number`. The old "Apply automated label" step reads it.
- **New sub-actions:** `select-mode`, `version`, `pack`, `publish`, plus `pr-status` and `pr-comment` ([README](https://github.com/changesets/action/blob/v2.1.2/README.md)). The README says: "If using trusted publishing, it's recommended to set up the individual sub-actions instead to tighten publish permissions."
- The action runs the CLI as `node <@changesets/cli/bin.js>` (`execChangesetsCli` in `src/utils.ts`), so every job that calls it needs Node 22.11+ or 24. The runner's Node 22.23.2 is enough, but set up Node 24 anyway, as the changesets example does.

**CLI 3** ([3.0.0 notes](https://github.com/changesets/changesets/releases/tag/%40changesets%2Fcli%403.0.0)):

- **Pre mode changed layout.** `pre.json` is now just `{ mode, tag }`. `initialVersions` and the list of used changesets are gone. Used changesets move into `.changeset/pre/` instead of staying in `.changeset/`. An old `pre.json` is migrated on the next `version` or `status`. The action ignores `pre/` changesets while in pre mode ([`src/readChangesetState.ts`](https://github.com/changesets/action/blob/v2.1.2/src/readChangesetState.ts)), so they don't keep reopening the Version PR.
- **Private packages are no longer versioned by default.** Good for us: `@luca/engine` and `@luca/board` are private and stay out of it. Checked: the private package kept `0.0.0`.
- `changeset version` exits 1 when there's nothing to version. The action only calls it when there are changesets, so this is fine.
- `changeset init` is now interactive. Write `config.json` by hand.
- New commands: `publish-plan` (which packages aren't on the registry yet) and `pack`/`publish --from-pack-dir`.

**changesets in a Bun repo.** changesets finds Bun workspaces fine. `@manypkg/tools` has a `BunTool` that reads the `{ packages, catalog }` form of `workspaces` ([source](https://github.com/Thinkmill/manypkg/blob/main/packages/tools/src/BunTool.ts)). But for pack and publish, changesets only knows npm, pnpm, and yarn, and falls back to **npm** for anything else ([`getPublishTool.ts`](https://github.com/changesets/changesets/blob/main/packages/cli/src/commands/publish/getPublishTool.ts)). `npm pack` does not rewrite Bun's `catalog:` or `workspace:` ranges. Checked: a package with `"zod": "catalog:"` packed by `npm pack` still said `"catalog:"`. `bun pm pack` wrote `"^4.3.6"`. So **changesets' own `pack`/`publish` sub-actions would ship a broken manifest** if the published `package.json` has `catalog:` or `workspace:` in its runtime dependencies. Keep `bun pm pack`. (If #446 makes the published manifest plain semver only, the stock sub-actions would work too. Tags would then be `@alecsibilia/luca@14.0.0-alpha.0` instead of `v14.0.0-alpha.0`.)

**The two paths:**

- **Path A, smallest change:** stay on `changesets/action@v1` (v1.9.0, node24) and `@changesets/cli@^2.31`. The `New tag:` trick keeps working, and the old YAML needs only the fixes in the table. The catch: v1 is the old line. The v2 README points CLI 2 users to a `maintenance/v1` branch, and v1 hasn't had a release since 2026-06-03. Checked: CLI 2.31.1 in pre mode `alpha`, from `13.0.1` with a `major` changeset, gives `14.0.0-alpha.0`.
- **Path B, recommended:** v2 + CLI 3, in the job layout from the changesets docs ([automating guide](https://github.com/changesets/changesets/blob/main/site/guide/automating.md), [trusted-publishing example](https://github.com/changesets/changesets/blob/main/site/guide/_snippets/automating-trusted-publishing.yaml)): `select-mode` → `version`, or `select-mode` → publish. Swap in our own publish job for their `pack` + `publish` sub-actions (Bun pack, see above). `select-mode` runs `changeset publish-plan`, which asks npm which versions aren't published yet. So the publish job runs only when there's a new version, and a rerun after success is a no-op. Checked: `publish-plan` for `14.0.0-alpha.1` gave `{ kind: "publish", tag: "alpha" }`. It also keeps `id-token: write` on the one job that publishes, which both changesets and npm recommend.

### 3. One package instead of four

The old group was `@alecsibilia/luca`, `-cli`, `-core`, `-tools`, all under `fixed`. Only `@alecsibilia/luca` was ever published. The umbrella inlined the other three with unbuild (old workflow comments, `git show old-luca-final:packages/luca/package.json`). For v14:

- `config.json`: `"fixed": []`. Keep `"access": "public"`, `"baseBranch": "main"`, and `"changelog": "@changesets/cli/changelog"`. `privatePackages` can stay at its CLI 3 default (off).
- Don't restore `old-luca-final:.changeset/*.md`. Its 10 changeset files (2 already used in pre mode) name only `luca-cli`, `luca-core`, and `luca-tools`, which are all deleted.
- Where the package lives and what's in it is #446. The workflow only needs its path (the old one used `packages/luca`, in `create-release.ts`, the dist-tag step, and the pack step).
- Checked: a public package with a `devDependencies` entry of `"@luca/engine": "workspace:*"` (private) versions cleanly under CLI 3. The private package is left alone.

### 4. Pre mode and the version numbers

How CLI 3 picks a prerelease number ([`assemble-release-plan/src/index.ts`](https://github.com/changesets/changesets/blob/main/packages/assemble-release-plan/src/index.ts), [`increment.ts`](https://github.com/changesets/changesets/blob/main/packages/assemble-release-plan/src/increment.ts)): new version = `semver.inc(current, bump)` + `-alpha.<n>`. `<n>` is the current prerelease number + 1, or `0` if the current version has none.

Checked with CLI 3.0.3 in pre mode `alpha`:

| `package.json` before | Changeset | Result |
| --- | --- | --- |
| `13.0.1` | major | `14.0.0-alpha.0` |
| `14.0.0-alpha.0` | patch | `14.0.0-alpha.1` |
| `13.1.0-alpha.0` | major | `14.0.0-alpha.1` (skips `.0`) |

So:

- The v14 package's `package.json` should say **`13.0.1`** when pre mode is entered, with one `major` changeset for v14. Later changesets of any size then give `14.0.0-alpha.1`, `.2`, and so on, because `semver.inc` of `14.0.0-alpha.N` by major, minor, or patch stays `14.0.0`.
- The PR that adds the workflow should also commit `.changeset/pre.json` (`pre enter alpha`) and the first `major` changeset. The first Version PR is then titled with ` (alpha)` on the end (the action adds it, `src/run.ts`).
- `13.1.0-alpha.0` is already on npm under `alpha`. That doesn't block anything. The first v14 publish moves `alpha` to `14.0.0-alpha.0`, and `13.1.0-alpha.0` stays installable by exact version.
- The changesets warning that a package's first-ever publish in pre mode also gets `latest` ([prereleases guide](https://github.com/changesets/changesets/blob/main/site/guide/prereleases.md)) doesn't apply. `@alecsibilia/luca` already has `latest`.

### 5. Keeping `latest` on `13.0.1`

- npm state now: `alpha` → `13.1.0-alpha.0`, `latest` → `13.0.1`. 19 versions, the last published 2026-07-17 (`npm view @alecsibilia/luca dist-tags versions time --json`).
- npm 11 and newer refuse to publish a prerelease without an explicit `--tag` ([npm v11.0.0 notes](https://github.com/npm/cli/releases/tag/v11.0.0)). The old dist-tag step maps `*-alpha.*` → `alpha`, and plain versions → `latest`.
- The danger is a plain version. `changeset pre exit` makes the next version `14.0.0`, the step picks `latest`, and `latest` moves before the `tmnb` gate. **Add a guard:** fail the publish job unless `.changeset/pre.json` says `"mode": "pre"` and the version matches `-alpha.`. Remove the guard on purpose when the `tmnb` run works. With the guard in place, the tag can come straight from `pre.json`'s `tag`.
- GitHub side: `create-release.ts` never passed `--prerelease`, so GitHub's "Latest" release badge is on `v13.1.0-alpha.0` today (`gh release list`). Add `--prerelease` for any version with a `-`.

### 6. npm trusted publishing: does the link still point here?

**What I could check (read-only):**

- `13.1.0-alpha.0` was published by `GitHub Actions <npm-oidc-no-reply@github.com>`, npm's trusted-publishing identity (`npm view @alecsibilia/luca@13.1.0-alpha.0 _npmUser`).
- Its SLSA provenance (from `https://registry.npmjs.org/-/npm/v1/attestations/@alecsibilia%2fluca@13.1.0-alpha.0`) names repository `https://github.com/asibilia/luca-framework`, workflow path `.github/workflows/release.yml`, ref `refs/heads/main`, event `push`, and a GitHub-hosted runner. So in July the link pointed at this repo and this file.
- GitHub environment `npm-publish` still exists, with a branch policy that allows only `main` (`gh api repos/asibilia/luca-framework/environments`). The old workflow's comment says the npm link was set up with `Environment name: npm-publish`. The provenance fields I read don't show the environment, so I can't confirm that from here.
- The repo is public, which provenance needs.

**What npm's docs say now:**

- Needs npm 11.5.1+ and Node 22.14.0+, a GitHub-hosted runner, and `id-token: write`. Fields: owner, repo, **workflow file name only** (for example `release.yml`), and an optional environment. All must match exactly and are case-sensitive. The file name must be the workflow that runs `npm publish`. Provenance is generated automatically ([npm: trusted publishers](https://docs.npmjs.com/trusted-publishers/)). So `--provenance` is redundant but harmless.
- **Links can't be edited.** "Existing trusted publisher connections cannot be changed". You delete one and make a new one (same page).
- **"Allowed actions" is new.** `npm stage publish` is always allowed. Direct `npm publish` depends on when the link was made: links made before 2026-05-20 allow `npm publish`; links made before 2026-09-03 needed an explicit choice; **links made after 2026-09-03 allow only staged publish unless `npm publish` is ticked** (same page; [GitHub changelog, 2026-09-03](https://github.blog/changelog/2026-09-03-multiple-trusted-publishing-configurations-for-npm/)). Ours was made around June 2026 and published directly in July, so it should allow `npm publish`. If it's ever remade, tick `npm publish`, or the workflow gets a stage-only link and `npm publish` fails.
- A package can now have more than one link (up to 10 per the npm page). The `npm trust` CLI page still says one, which looks outdated.
- `npm trust list <package>` shows the links from the command line. It needs npm 11.15.0+, account 2FA, and write access ([npm-trust](https://docs.npmjs.com/cli/v11/commands/npm-trust/)). The local npm here is 11.8.0, too old.
- 2FA-bypass tokens lose direct publish in January 2027 ([GitHub changelog, 2026-07-08](https://github.blog/changelog/2026-07-08-npm-install-time-security-and-gat-bypass2fa-deprecation/)). That doesn't affect OIDC. It's one more reason not to fall back to an `NPM_TOKEN`.

**What to keep in the workflow so the link keeps matching:** file `.github/workflows/release.yml`; `environment: npm-publish` and `id-token: write` on the job that runs `npm publish`; trigger on `push` to `main` (the environment allows only `main`); no `registry-url` on `setup-node`. The old comment explains why: an `.npmrc` `_authToken` line beats OIDC and gets a 404. `setup-node` v7 dropped its dummy `NODE_AUTH_TOKEN` export, but not writing an `.npmrc` is still simplest. changesets/action v2 also stopped writing `.npmrc`. The `ENEEDAUTH` note in the old comment (npm/cli#9088) still applies if the environment is missing from the job.

### 7. GitHub repo settings (read-only checks)

- "Allow GitHub Actions to create and approve pull requests" is on (`can_approve_pull_request_reviews: true`). The version sub-action needs it. Default workflow permissions are `read`, so each job must set its own permissions, as the old one did.
- The `automated` label exists. No leftover `changeset-release/main` branch.
- Ruleset `main`: PR required, squash only, admin bypass through a PR. It no longer has `required_signatures`, which was the old reason for `commitMode: github-api`. v2 pushes through the API by default anyway, and those commits are signed.
- **Version PRs and PR checks (for #449):** GitHub now starts `pull_request` runs for PRs opened by `GITHUB_TOKEN`, but in an **approval-required** state. Someone with write access clicks "Approve workflows to run" in the merge box ([GitHub docs: GITHUB_TOKEN](https://docs.github.com/en/actions/concepts/security/github_token)). So the new PR check workflow will wait on each Version PR until Alec approves it. That's fine, since the publish job re-runs the checks anyway. A GitHub App token would avoid the click (changesets guide).

### 8. The old scripts

- `compute-release-title.ts`: works with CLI 3 as is. `status --output` still writes the release plan with `releases[].name/oldVersion/newVersion` ([`status/index.ts`](https://github.com/changesets/changesets/blob/main/packages/cli/src/commands/status/index.ts)). `status` needs git history, so keep `fetch-depth: 0` in that job. The action adds ` (alpha)`, so the title comes out like `chore(release): version packages (luca@14.0.0-alpha.1) (alpha)`.
- `create-release.ts`: keep the `v<version>` tag and CHANGELOG notes. Add `--prerelease`. Delete the `New tag:` lines (only v1 read them). Update the package path if #446 moves it.
- Root `package.json` scripts: bring back `"changeset": "changeset"` and `"version": "changeset version && bun install"`. The `bun install` refreshes `bun.lock` with the new version so `--frozen-lockfile` passes later. Don't bring back `"release": "changeset publish"`. It would go through npm and ship `catalog:` ranges.

## Suggested shape (Path B)

A sketch for the spec, not a finished workflow. It stays in `.github/workflows/release.yml`.

```yaml
name: Release
on: { push: { branches: [main] } }
permissions: {}
concurrency: { group: ${{ github.workflow }}-${{ github.ref }} }

jobs:
  select-mode:            # permissions: contents: read
    # checkout@v7 (persist-credentials: false), setup-bun@v2, setup-node@v7 (24), bun install --frozen-lockfile
    # - uses: changesets/action/select-mode@v2.1.2   -> outputs.mode: version | publish | none

  version:                # if mode == 'version'; permissions: contents: write, pull-requests: write
    # checkout@v7 (fetch-depth: 0), setup-bun, setup-node 24, bun install --frozen-lockfile
    # - run: bun .github/scripts/compute-release-title.ts
    # - uses: changesets/action/version@v2.1.2
    #     with: { script: bun run version, pr-title: <title>, commit-message: <title> }
    # - label the PR from steps.<id>.outputs.pr-number

  publish:                # if mode == 'publish'; environment: npm-publish
                          # permissions: contents: write (gh release), id-token: write (OIDC)
    # checkout@v7, setup-bun, setup-node 24 (no registry-url), bun install --frozen-lockfile
    # - the checks from #449, then build (#446)
    # - guard: .changeset/pre.json mode == pre AND version matches -alpha.  (until the tmnb gate)
    # - bun pm pack --destination ./.pack
    # - npm publish ./.pack/*.tgz --access public --tag alpha
    # - bun .github/scripts/create-release.ts   (v<version>, --prerelease)
```

## Only Alec can check or do

1. **On npmjs.com** → Packages → `@alecsibilia/luca` → Settings → Trusted publishing. Confirm: owner `asibilia`, repo `luca-framework`, workflow `release.yml`, environment `npm-publish`, and allowed actions include **`npm publish`** (not stage-only). Or run `npm trust list @alecsibilia/luca` with npm 11.15.0 or newer (needs 2FA).
2. **Don't remake the link** unless the file name changes. If it must be remade, tick `npm publish`.
3. On the same settings page, check Publishing access. "Require two-factor authentication and disallow tokens" is fine with OIDC, and it's what npm recommends.
4. Approve the check runs on each Version PR ("Approve workflows to run"), then merge. Merging it is what publishes.
5. Decide Path A or Path B. This note recommends B.

## Uncertain

- **The environment on the npm link.** The old comment says `npm-publish`, but only the npm settings page shows it. If it's blank there, `environment: npm-publish` on the job is still harmless.
- **The link's allowed actions.** It published directly in July, so it allowed `npm publish` then. The 2026-09-03 change says existing links don't change behavior, but I can't see the setting.
- **`changesets/action` v1's future.** It still works (v1.9.0, node24), but nothing says how long v1 gets fixes.
- **Bun 1.4.** Not tested: whether `bun pm pack`'s catalog rewrite is the same in Bun 1.4.2. The probe used 1.3.11. Pin the Bun version the repo uses.
- **The full Path B run** (select-mode → version PR → publish) wasn't run end to end. Only the parts were checked: the CLI version math, the publish plan, pack output, and the action source. The first real run will be the test, and it only publishes an alpha.
