/**
 * Doctor's `build_cache` check (#721): each `build_cache_paths` path should
 * be ignored by git in the repo's checkout, since Luca never copies one
 * that isn't, so a copied cache never ends up in a commit.
 */
import uniq from 'lodash/uniq'

import { ok, warning, type Found } from './doctor-checks'

import { buildCachePathsOf, type EngineConfig } from '../config/engine-config'
import { ignoredAmong, isGlob, matchesIn } from '../core/build-cache'
import { createGitAdapter } from '../git/git-adapter'

/**
 * The `build_cache` check for a config with build cache paths: a warning
 * naming each path git doesn't ignore in the checkout, made into one; else
 * OK. A plain entry is checked as written, even before its folder is there;
 * a glob, by its matches in the checkout.
 */
export const checkBuildCache = async ({
    repo,
    config,
}: {
    repo: string
    config: EngineConfig
}): Promise<Found> => {
    const paths: string[] = []
    for (const entry of buildCachePathsOf({ config })) {
        paths.push(
            ...(isGlob(entry) ? await matchesIn({ entry, dir: repo }) : [entry])
        )
    }
    const checked = uniq(paths)
    const ignored = await ignoredAmong({
        git: createGitAdapter({ repo_root: repo }),
        cwd: repo,
        paths: checked,
    })
    const missing = checked.filter((path) => !ignored.has(path))
    if (missing.length === 0) {
        return ok('Each build_cache_paths path is ignored by git')
    }
    return warning({
        detail: missing
            .map(
                (path) =>
                    `\`build_cache_paths\` path ${path} isn't ignored by git, so Luca won't copy it.`
            )
            .join(' '),
        fix: missing.map((path) => `Add ${path} to .gitignore.`).join(' '),
    })
}
