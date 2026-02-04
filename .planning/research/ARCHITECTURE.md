# Architecture Patterns

**Domain:** CLI-installable agent development framework for Cursor IDE
**Researched:** 2026-02-04
**Overall Confidence:** HIGH

## Executive Summary

This document synthesizes architectural patterns for building a pluggable, updatable agent framework. The core challenge: enabling zero-friction adoption with `npx luca init` while supporting extensive customization and seamless updates that don't break user modifications.

**Key architectural decisions:**
1. **Origin/User separation** - Framework files vs user customizations in distinct directories
2. **Adapter-based integrations** - Interface contracts for work tracking, approvals, etc.
3. **Convention over configuration** - Sensible defaults with explicit override paths
4. **Layered configuration** - Global → project → local with clear precedence
5. **Manifest-driven updates** - Track what's framework vs user-modified

---

## Recommended Architecture

### High-Level Structure

```
.cursor/
├── origin/                    # FRAMEWORK (managed, updatable)
│   ├── agents/               # Agent definitions
│   ├── workflows/            # Orchestration workflows
│   ├── templates/            # Document templates
│   ├── references/           # Shared knowledge
│   └── manifest.json         # Framework version + file hashes
│
├── agents/                    # USER (customizable, preserved)
│   └── custom-agent.md       # User-defined agents
│
├── skills/                    # USER (customizable, preserved)
│   └── custom-skill/         # User-defined skills
│
├── rules/                     # USER (customizable, preserved)
│   └── project-rules.mdc     # User rules
│
└── config.json               # USER configuration (layered)

.planning/
├── config.json               # Project configuration
├── integrations/             # Integration adapters
│   ├── jira-adapter.ts       # Work tracking implementation
│   └── github-adapter.ts     # PR/issue implementation
└── [project state files]
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `origin/` | Framework core (agents, workflows, templates) | Config, Integrations |
| `agents/` | User-defined agent extensions | Origin agents (extension) |
| `skills/` | User-defined skills/commands | Origin workflows |
| `integrations/` | Adapter implementations for external services | Framework via contracts |
| `config.json` | Configuration layering | All components |

### Data Flow

**Initialization Flow:**
```
npx luca init
    │
    ├── 1. Prompt for configuration (branding, integrations)
    ├── 2. Write .cursor/origin/ (framework files)
    ├── 3. Write .cursor/config.json (user config)
    ├── 4. Write .planning/config.json (project config)
    ├── 5. Generate manifest.json (file hashes for updates)
    └── 6. Create integration adapter stubs
```

**Update Flow:**
```
npx luca update
    │
    ├── 1. Fetch latest framework version
    ├── 2. Compare manifest.json (current vs new)
    ├── 3. Identify: unchanged, user-modified, framework-updated
    ├── 4. Update unchanged origin/ files
    ├── 5. Flag conflicts for user-modified files
    └── 6. Update manifest.json
```

---

## Patterns to Follow

### Pattern 1: Origin/User Separation

**What:** Strict separation between framework-managed files and user customizations.

**When:** Always. This is the core pattern enabling updates without breaking customizations.

**Rationale:** 
- VS Code extension model proves this works at scale
- Create React App's ejection problem shows the alternative doesn't work
- Users can customize without fear of losing changes during updates

**Example:**

```
.cursor/
├── origin/                    # ⚠️ FRAMEWORK MANAGED - DO NOT EDIT
│   ├── agents/
│   │   ├── lu-planner.md     # Framework agent
│   │   └── lu-executor.md    # Framework agent
│   └── manifest.json         # Tracks versions + hashes
│
├── agents/                    # ✅ USER SPACE - Edit freely
│   ├── my-custom-agent.md    # User agent (extends framework)
│   └── overrides/            # User overrides of framework agents
│       └── lu-planner.md     # Override (takes precedence)
```

**Resolution order (highest priority first):**
1. `.cursor/agents/overrides/{name}.md` (user override)
2. `.cursor/agents/{name}.md` (user custom)
3. `.cursor/origin/agents/{name}.md` (framework default)

**Sources:** VS Code extension architecture, Laravel vendor directory pattern

---

### Pattern 2: Adapter-Based Integrations

**What:** Define interfaces (contracts) for integrations, implement via adapter classes.

**When:** Work tracking (Jira, Linear, GitHub Issues), approvals, notifications.

**Rationale:**
- Adapter pattern is proven for bridging incompatible interfaces
- Interface segregation allows minimal implementation for simple cases
- New integrations don't require framework changes

**Example:**

```typescript
// .cursor/origin/contracts/work-tracker.ts
export interface WorkTrackerContract {
  // Required methods
  getTicket(id: string): Promise<Ticket>;
  
  // Optional methods (have defaults)
  createBranch?(ticket: Ticket): Promise<string>;
  linkPR?(ticketId: string, prUrl: string): Promise<void>;
}

export interface Ticket {
  id: string;
  title: string;
  description: string;
  status: 'open' | 'in_progress' | 'done';
  url?: string;
}

// .planning/integrations/jira-adapter.ts (USER IMPLEMENTED)
import type { WorkTrackerContract, Ticket } from '../.cursor/origin/contracts/work-tracker';

export const JiraAdapter: WorkTrackerContract = {
  async getTicket(id: string): Promise<Ticket> {
    // User implements Jira-specific logic
    const response = await callJiraMCP('getJiraIssue', { issueIdOrKey: id });
    return {
      id: response.key,
      title: response.fields.summary,
      description: response.fields.description,
      status: mapJiraStatus(response.fields.status),
      url: `${JIRA_BASE_URL}/browse/${response.key}`,
    };
  },
  
  // Optional: implement if needed
  async linkPR(ticketId: string, prUrl: string) {
    await callJiraMCP('addCommentToJiraIssue', {
      issueIdOrKey: ticketId,
      body: `PR created: ${prUrl}`,
    });
  },
};
```

**Built-in adapters provided:**
- `jira-adapter.ts` - Jira via Atlassian MCP
- `linear-adapter.ts` - Linear via API
- `github-issues-adapter.ts` - GitHub Issues via `gh` CLI
- `placeholder-adapter.ts` - PT-0000 placeholder (no external system)

**Sources:** InversifyJS plugin system, LangChain Connery architecture

---

### Pattern 3: Convention Over Configuration

**What:** Establish sensible defaults; only require configuration for exceptions.

**When:** File locations, naming conventions, workflow behaviors.

**Rationale:**
- Ruby on Rails proved this reduces boilerplate dramatically
- New developers understand patterns by examining existing code
- Fewer configuration files to maintain and conflict

**Example - Default Conventions:**

| Convention | Default | Override |
|------------|---------|----------|
| Agent location | `.cursor/origin/agents/` | `config.agentPaths` |
| Skill location | `.cursor/skills/` | `config.skillPaths` |
| Planning directory | `.planning/` | `config.planningDir` |
| Ticket pattern | `[A-Z]+-\d+` | `config.ticketPattern` |
| Branch format | `{ticket}--{slug}` | `config.branchFormat` |
| Command prefix | `lu` | `config.commandPrefix` |

**Convention discovery:**

```typescript
// Framework discovers agents by convention
function discoverAgents(): Agent[] {
  const agents: Agent[] = [];
  
  // 1. Framework agents (always available)
  agents.push(...loadFromDir('.cursor/origin/agents/'));
  
  // 2. User agents (extend/add)
  agents.push(...loadFromDir('.cursor/agents/'));
  
  // 3. User overrides (replace framework)
  const overrides = loadFromDir('.cursor/agents/overrides/');
  return mergeWithOverrides(agents, overrides);
}
```

**Sources:** Ruby on Rails, Laravel directory structure

---

### Pattern 4: Layered Configuration

**What:** Configuration merges from multiple sources with clear precedence.

**When:** Any configurable behavior (branding, integrations, workflow toggles).

**Rationale:**
- Enterprise teams need project-level defaults with user-level overrides
- Cosmiconfig pattern is proven across ESLint, Prettier, Babel
- Avoids configuration sprawl while enabling customization

**Configuration layers (highest priority first):**

```
1. Environment variables     LUCA_COMMAND_PREFIX=myprefix
2. Local config              .planning/config.local.json (gitignored)
3. Project config            .planning/config.json (committed)
4. User config               ~/.luca/config.json (global)
5. Framework defaults        .cursor/origin/defaults.json
```

**Example configuration:**

```json
// .planning/config.json (project level)
{
  "branding": {
    "commandPrefix": "lu",
    "ticketPattern": "PT-\\d+|ENG-\\d+",
    "headerTemplate": "🔧 {{projectName}} - {{phase}}"
  },
  "integrations": {
    "workTracker": "jira",
    "workTrackerConfig": {
      "cloudId": "abc123",
      "projectKey": "PT"
    }
  },
  "workflow": {
    "requireApproval": ["destructive", "external"],
    "verificationLevel": "standard"
  }
}
```

**Merge behavior:**

```typescript
// Deep merge with array replacement
function loadConfig(): Config {
  const defaults = loadDefaults();
  const global = loadGlobal();    // ~/.luca/config.json
  const project = loadProject();  // .planning/config.json
  const local = loadLocal();      // .planning/config.local.json
  const env = loadEnv();          // LUCA_* environment variables
  
  return deepMerge(defaults, global, project, local, env);
}
```

**Sources:** Cosmiconfig, Docker Compose override, Hiera (Puppet)

---

### Pattern 5: Manifest-Driven Updates

**What:** Track framework file states to enable intelligent updates.

**When:** `npx luca update` or version notification.

**Rationale:**
- Git merge strategies alone can't distinguish framework vs user changes
- Hash-based comparison enables precise conflict detection
- Users can accept/reject individual file updates

**Manifest structure:**

```json
// .cursor/origin/manifest.json
{
  "version": "1.2.0",
  "generatedAt": "2026-02-04T10:30:00Z",
  "files": {
    "agents/lu-planner.md": {
      "hash": "sha256:abc123...",
      "version": "1.2.0",
      "category": "agent"
    },
    "workflows/execute-phase.md": {
      "hash": "sha256:def456...",
      "version": "1.1.0",
      "category": "workflow"
    }
  },
  "userModified": [
    ".cursor/agents/overrides/lu-planner.md"
  ]
}
```

**Update algorithm:**

```
For each file in new manifest:
  
  IF file not in current manifest:
    → ADD (new framework file)
  
  ELSE IF currentHash == newHash:
    → SKIP (unchanged)
  
  ELSE IF currentHash == lastKnownFrameworkHash:
    → UPDATE (framework changed, user didn't modify)
  
  ELSE:
    → CONFLICT (both changed)
    → Create .cursor/origin/conflicts/{file}.md with diff
    → User resolves manually
```

**Sources:** MSIX package updates, Git merge drivers, npm lockfile patterns

---

### Pattern 6: Lazy Loading with Activation Events

**What:** Load components only when needed based on triggers.

**When:** Agents, integrations, heavy processing.

**Rationale:**
- VS Code proves this scales to thousands of extensions
- Faster startup time
- Lower memory footprint

**Example:**

```typescript
// Agent activation events
interface AgentManifest {
  name: string;
  activationEvents: string[];
  // ...
}

const agentManifest = {
  name: 'security-auditor',
  activationEvents: [
    'onCommand:lu-security-review',     // When command invoked
    'onFileType:*.secrets.json',         // When file type opened
    'onWorkflowPhase:security-*',        // When phase matches pattern
  ],
};

// Only load agent when activation event fires
function getAgent(name: string): Agent | null {
  const manifest = getAgentManifest(name);
  
  if (!isActivationEventFired(manifest.activationEvents)) {
    return null; // Don't load yet
  }
  
  return loadAgent(name); // Load on demand
}
```

**Sources:** VS Code extension activation, oclif plugin loading

---

### Pattern 7: Hook-Based Extensibility

**What:** Define lifecycle hooks that plugins/integrations can tap into.

**When:** Workflow events (pre-plan, post-execute, pre-commit).

**Rationale:**
- oclif proves hooks enable inter-plugin communication
- Non-invasive extension mechanism
- Multiple plugins can respond to same event

**Example hooks:**

```typescript
// Hook definitions
type HookName = 
  | 'pre:init'           // Before initialization
  | 'post:init'          // After initialization  
  | 'pre:plan'           // Before planning phase
  | 'post:plan'          // After planning phase
  | 'pre:execute'        // Before task execution
  | 'post:execute'       // After task execution
  | 'pre:commit'         // Before git commit
  | 'post:verify'        // After verification
  | 'on:error';          // When error occurs

// Hook registration
function registerHook(name: HookName, handler: HookHandler): void;

// Integration using hooks
// .planning/integrations/slack-notify.ts
registerHook('post:verify', async (context) => {
  if (context.verification.status === 'passed') {
    await notifySlack(`✅ Phase ${context.phase} verified`);
  }
});

registerHook('on:error', async (context) => {
  await notifySlack(`❌ Error in ${context.phase}: ${context.error.message}`);
});
```

**Sources:** oclif hooks, Webpack plugin tapable, Git hooks

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Monolithic Configuration

**What:** Single massive config file controlling everything.

**Why bad:**
- Hard to understand what's framework vs user config
- Merge conflicts on every update
- No layering or environment-specific overrides

**Instead:** Use layered configuration with separate files per concern.

---

### Anti-Pattern 2: Direct Framework Modification

**What:** Telling users to edit files in `origin/` directory.

**Why bad:**
- Updates will overwrite user changes
- No way to distinguish customizations from framework
- Creates update fear (users avoid updating)

**Instead:** Origin/User separation with override directories.

---

### Anti-Pattern 3: Ejectable-Only Customization

**What:** Requiring users to "eject" (copy all framework files) to customize.

**Why bad:**
- Create React App proved this leads to unmaintainable forks
- Users lose all update capabilities
- Customization becomes all-or-nothing

**Instead:** Targeted overrides, adapter interfaces, configuration layers.

---

### Anti-Pattern 4: Tight Coupling to External Services

**What:** Hardcoding Jira/GitHub/Linear API calls throughout framework.

**Why bad:**
- Can't swap integrations without code changes
- Testing requires real service connections
- Enterprise teams may have different tools

**Instead:** Adapter interfaces with swappable implementations.

---

### Anti-Pattern 5: Magic String Configuration

**What:** Using string identifiers that aren't validated.

**Why bad:**
- Typos cause silent failures
- No autocomplete or type safety
- Runtime errors instead of compile-time

**Instead:** TypeScript enums, Zod schemas, validated configuration.

---

## Scalability Considerations

| Concern | Small Team (1-5) | Medium Team (5-20) | Enterprise (20+) |
|---------|------------------|-------------------|------------------|
| **Configuration** | Single project config | Per-environment configs | Centralized config server |
| **Agents** | Framework defaults | Custom team agents | Agent marketplace/registry |
| **Updates** | Manual `npx luca update` | CI/CD integration | Change approval workflow |
| **Integrations** | Built-in adapters | Custom adapters | Enterprise SSO/audit |
| **State** | Local `.planning/` | Shared team state | Distributed state sync |

### Enterprise Considerations

**Audit trail:**
```typescript
interface AuditEvent {
  timestamp: string;
  user: string;
  action: 'plan' | 'execute' | 'verify' | 'commit';
  details: Record<string, unknown>;
}

// Hook for enterprise audit
registerHook('post:execute', async (context) => {
  await auditLog({
    timestamp: new Date().toISOString(),
    user: context.user,
    action: 'execute',
    details: {
      phase: context.phase,
      filesModified: context.filesModified,
    },
  });
});
```

**Approval gates:**
```typescript
interface ApprovalConfig {
  require: ('destructive' | 'external' | 'security' | 'all')[];
  approvers: string[] | 'team-lead' | 'security-team';
  timeout: number; // minutes
}

// Checkpoint for approval
if (requiresApproval(action, config.approvals)) {
  return checkpoint({
    type: 'approval',
    action,
    message: `Action requires approval: ${action.description}`,
  });
}
```

---

## File System Layout Recommendation

### Minimal Installation (Default)

```
.cursor/
├── origin/                    # Framework (updatable)
│   ├── agents/               # 26+ agent definitions
│   ├── workflows/            # Orchestration workflows
│   ├── templates/            # Document templates
│   ├── references/           # Shared knowledge
│   ├── contracts/            # Integration interfaces
│   └── manifest.json         # Version tracking
│
├── config.json               # User configuration
│
└── skills/                   # Skills (framework + user)
    └── lu-*/                 # Luca command skills

.planning/
├── config.json               # Project configuration
├── integrations/             # Integration adapters
│   └── selected-adapter.ts   # Based on init choice
├── BRAIN.md                  # Project identity
├── MEMORY.md                 # Long-term learning
├── WORKING.md                # Session memory
├── PROJECT.md                # Requirements/constraints
├── ROADMAP.md                # Phase structure
└── STATE.md                  # Current position
```

### Extended Installation (Customized)

```
.cursor/
├── origin/                    # Framework (updatable)
│   └── [same as above]
│
├── agents/                    # User agent space
│   ├── my-custom-agent.md    # Custom agent
│   └── overrides/            # Framework overrides
│       └── lu-planner.md     # Customized planner
│
├── skills/                    # Skills
│   ├── lu-*/                 # Framework skills
│   └── my-skill/             # Custom skills
│
├── rules/                     # Cursor rules
│   └── project-rules.mdc     # Project-specific rules
│
└── config.json               # User configuration

.planning/
├── config.json               # Project configuration
├── config.local.json         # Local overrides (gitignored)
├── integrations/             # Integration adapters
│   ├── jira-adapter.ts       # Jira implementation
│   ├── slack-notify.ts       # Slack notifications
│   └── custom-approval.ts    # Custom approval flow
└── [state files]
```

---

## Upgrade Path Architecture

### Version Notification

```typescript
// On any luca command
async function checkVersion(): Promise<void> {
  const current = readManifest().version;
  const latest = await fetchLatestVersion(); // npm registry
  
  if (semver.gt(latest, current)) {
    console.log(`
📦 Luca ${latest} available (current: ${current})
   Run: npx luca update
   
   Changes: https://github.com/luca/releases/${latest}
    `);
  }
}
```

### Update Process

```
npx luca update [--dry-run] [--force]
    │
    ├── 1. Backup current .cursor/origin/
    │
    ├── 2. Download new framework version
    │
    ├── 3. Compare manifests:
    │      ├── New files → Add
    │      ├── Removed files → Archive (don't delete)
    │      ├── Unchanged → Skip
    │      ├── Framework-only changes → Update
    │      └── User-modified conflicts → Report
    │
    ├── 4. Apply non-conflicting updates
    │
    ├── 5. Report conflicts:
    │      "3 files have conflicts. Review in .cursor/origin/conflicts/"
    │
    ├── 6. Update manifest.json
    │
    └── 7. Run post-update hooks (migrations, etc.)
```

### Migration Support

```typescript
// migrations/1.1.0-to-1.2.0.ts
export const migration = {
  version: '1.2.0',
  description: 'Add WORKING.md to planning structure',
  
  async up(context: MigrationContext): Promise<void> {
    // Add new file if doesn't exist
    if (!exists('.planning/WORKING.md')) {
      await copyTemplate('templates/WORKING.md', '.planning/WORKING.md');
    }
    
    // Update config schema
    context.config.cognitive = context.config.cognitive ?? {
      enabled: true,
      memory_recall: true,
    };
  },
  
  async down(context: MigrationContext): Promise<void> {
    // Rollback if needed
    delete context.config.cognitive;
  },
};
```

---

## Sources

| Topic | Source | Confidence |
|-------|--------|------------|
| Plugin architecture | oclif documentation | HIGH |
| Extension isolation | VS Code extension docs | HIGH |
| Configuration layering | Cosmiconfig, Hiera | HIGH |
| Adapter pattern | InversifyJS, general patterns | HIGH |
| Convention over configuration | Rails, Laravel | HIGH |
| Update patterns | MSIX, semver.org | MEDIUM |
| IDE agent frameworks | Cursor docs, AGENTS.md | MEDIUM |
| LangChain architecture | LangChain blog | MEDIUM |

---

## Open Questions for Implementation

1. **Agent discovery**: Should user agents extend or replace framework agents?
   - Recommendation: Override directory for replacement, separate directory for extension

2. **Config format**: JSON vs YAML vs TypeScript?
   - Recommendation: JSON for static config, TypeScript for dynamic/validated config

3. **Integration runtime**: Load adapters at startup or on-demand?
   - Recommendation: On-demand with manifest-based discovery

4. **State sync**: How to handle multi-machine development?
   - Recommendation: Git-committed state, local-only for sensitive data

---

*Architecture research: 2026-02-04*
