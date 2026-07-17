export {
    writeProjectSkeleton,
    ensureLucaGitignore,
    LUCA_GITIGNORE_ENTRIES,
} from './helpers/write-project-skeleton.ts'
export type { WriteProjectSkeletonOptions } from './helpers/write-project-skeleton.ts'

export {
    wireClaudeHooks,
    wireAntigravityHooks,
    wireAntigravityMcp,
    mergeStageGateRegistration,
    mergeAntigravityHookRegistration,
    mergeAntigravityMcpRegistration,
} from './helpers/wire-claude-hooks.ts'
export type { WireClaudeHooksOptions } from './helpers/wire-claude-hooks.ts'

export {
    installSkills,
    listBundledArtifacts,
    defaultClaudeHome,
    defaultAntigravityHome,
} from './helpers/install-skills.ts'
export type {
    InstallSkillsOptions,
    InstallSkillsArtifacts,
    BundledArtifacts,
} from './helpers/install-skills.ts'

export { installHooks, mergeLucaHookSettings } from './helpers/install-hooks.ts'
export type { InstallHooksOptions } from './helpers/install-hooks.ts'

export {
    enrichTraceMetadata,
    mergeTraceMetadata,
} from './helpers/enrich-trace-metadata.ts'
export type {
    EnrichTraceMetadataOptions,
    TraceMetadataIds,
} from './helpers/enrich-trace-metadata.ts'

export {
    installStatusline,
    mergeStatuslineRegistration,
} from './helpers/install-statusline.ts'
export type {
    InstallStatuslineOptions,
    StatuslineMergeAction,
} from './helpers/install-statusline.ts'

export {
    HARNESSES,
    claudeHarness,
    antigravityHarness,
} from './helpers/harness.ts'
export type { Harness, HarnessInstallExtrasOptions } from './helpers/harness.ts'
