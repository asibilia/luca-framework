export {
    ProjectPreferencesSchema,
    BranchTypeRuleSchema,
    BaseRuleSchema,
    SectionName,
    SAFE_FREEFORM_SCHEMA,
    REGEX_SOURCE_SCHEMA,
    DEFAULT_PREFERENCES,
} from './schemas.ts'

export type { ProjectPreferences } from './schemas.ts'

export {
    PREFERENCE_SECTIONS,
    extractPreferences,
    mergePreferences,
} from './preferences.ts'

export type {
    ExtractPreferencesResult,
    MergePreferencesResult,
} from './preferences.ts'
