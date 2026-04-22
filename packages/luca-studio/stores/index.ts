// -- Config atoms (Layer 1: server state + Layer 2: drafts) -------------------
export {
    compileStatusAtom,
    configAtom,
    configEtagAtom,
    conflictAtom,
    agentRegistryAtom,
    routingTableAtom,
    stateAtom,
    configDraftAtom,
    routingDraftAtom,
} from './config-atoms'
export type { CompileStatus, ConflictState } from './config-atoms'

// -- Entity draft atoms (Layer 2: per-entity drafts + history) ----------------
export {
    agentDraftAtom,
    skillDraftAtom,
    ruleDraftAtom,
    agentHistoryAtom,
    skillHistoryAtom,
    ruleHistoryAtom,
} from './entity-atoms'

// -- Dirty tracking (Layer 3) -------------------------------------------------
export {
    dirtySetAtom,
    validationErrorsAtom,
    canSaveAtom,
    markDirtyAtom,
    markCleanAtom,
    setValidationErrorsAtom,
} from './dirty-tracking'

// -- Layout -------------------------------------------------------------------
export {
    navRailExpandedAtom,
    detailPanelStateAtom,
    detailPanelWidthAtom,
    navRailHoveredAtom,
    layoutContextAtom,
    navRailWidthAtom,
} from './layout'
export type { LayoutContext, DetailPanelState } from './layout'

// -- Pipeline -----------------------------------------------------------------
export {
    pipelineNodesAtom,
    pipelineEdgesAtom,
    selectedPipelineNodeIdAtom,
    pipelineMinimapVisibleAtom,
    pipelineLayoutDirectionAtom,
} from './pipeline-atoms'

// -- Session ------------------------------------------------------------------
export { selectedSessionAtom } from './session'

// -- Vault --------------------------------------------------------------------
export { vaultAtom } from './vault'

// -- Theme --------------------------------------------------------------------
export { themeAtom } from './theme'

// -- Filters ------------------------------------------------------------------
export { eventTypeFilterAtom, searchQueryAtom } from './filters'
