# Phase 2: Integrations & Updates - Research

**Researched:** 2026-02-04
**Domain:** Pluggable adapters, CLI update mechanisms, work tracking integrations
**Confidence:** HIGH

## Summary

Phase 2 adds three major capabilities to the Luca framework:

1. **Work Tracker Adapters**: Pluggable interface for Jira (Atlassian MCP) and GitHub Issues (gh CLI) with a placeholder fallback
2. **Update Mechanism**: SHA-256 manifest-based update with conflict detection, backup, and resolution workflow
3. **Approval Configuration**: Configurable gates for destructive operations with audit trail

The existing Phase 1 codebase provides strong patterns to follow: citty for commands, @clack/prompts for wizard interactions, and manifest.ts for file hashing. The adapter pattern is well-suited for TypeScript with a contract interface + factory pattern.

**Primary recommendation:** Design `WorkTrackerContract` as a minimal async interface with `getTicket()` required and `createBranch()`/`linkPR()` optional. Use factory pattern for adapter instantiation. Leverage existing `hashFile()` from manifest.ts for update conflict detection.

## Standard Stack

The established libraries/tools for this domain:

### Core (Already in Phase 1)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| citty | ^0.2.0 | CLI framework | Already used for `init`, add `update` command |
| @clack/prompts | ^1.0.0 | Interactive prompts | Already used for wizard, use for conflict resolution |
| consola | ^3.4.0 | Logging | Already used throughout |
| pathe | ^2.0.3 | Path utilities | Already used for cross-platform paths |

### New Dependencies
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| update-notifier | ^7.3.1 | Version check notifications | Non-blocking update alerts on any command |
| execa | ^9.x | Shell command execution | For `gh` CLI calls in GitHub adapter |
| semver | ^7.x | Version comparison | Comparing framework versions during update |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| update-notifier | Custom npm registry check | update-notifier handles caching, timing, notification UI |
| execa | Bun.$ | execa is more portable if package used outside Bun |
| Factory pattern | Dependency injection | Factory is simpler for 3 adapters |

**Installation:**
```bash
bun add update-notifier execa semver
bun add -d @types/semver
```

## Architecture Patterns

### WorkTrackerContract Interface

```
packages/luca-framework/
├── src/
│   ├── contracts/
│   │   └── work-tracker.ts       # Contract interface definition
│   ├── adapters/
│   │   ├── index.ts              # Factory function
│   │   ├── jira-adapter.ts       # Jira via environment + MCP guidance
│   │   ├── github-adapter.ts     # GitHub Issues via gh CLI
│   │   └── placeholder-adapter.ts # No-op fallback
│   ├── commands/
│   │   ├── init.ts               # Existing
│   │   └── update.ts             # NEW: Update command
│   └── utils/
│       ├── manifest.ts           # Existing - enhanced with update logic
│       └── version-check.ts      # NEW: Registry version checking
```

### Pattern 1: TypeScript Adapter Contract

**What:** Interface-first design with factory instantiation

**Why:** Enables compile-time type checking while allowing runtime adapter selection based on config.

**Contract Interface:**
```typescript
// src/contracts/work-tracker.ts

/**
 * Work tracker ticket details
 */
export interface WorkTicket {
  id: string;
  title: string;
  description: string;
  type: 'bug' | 'story' | 'task' | 'epic' | 'subtask';
  status: string;
  priority: 'highest' | 'high' | 'medium' | 'low' | 'lowest';
  assignee?: string;
  url: string;
}

/**
 * Result type for adapter operations
 */
export type AdapterResult<T> = 
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Work tracker adapter contract.
 * 
 * Implemented by: JiraAdapter, GitHubAdapter, PlaceholderAdapter
 * 
 * REQUIRED methods must be implemented by all adapters.
 * OPTIONAL methods may return { success: false, error: 'Not implemented' }
 */
export interface WorkTrackerContract {
  /** Adapter identifier */
  readonly name: 'jira' | 'github' | 'none';
  
  /**
   * REQUIRED: Fetch ticket details by ID.
   * 
   * @param ticketId - Ticket identifier (e.g., "PROJ-1234" or "#123")
   * @returns Ticket details or error
   */
  getTicket(ticketId: string): Promise<AdapterResult<WorkTicket>>;
  
  /**
   * OPTIONAL: Create a branch linked to ticket.
   * 
   * Not all trackers support branch linking. Returns error if unsupported.
   * 
   * @param ticketId - Ticket identifier
   * @param branchName - Suggested branch name
   * @returns Branch name (may differ from suggestion) or error
   */
  createBranch?(ticketId: string, branchName: string): Promise<AdapterResult<string>>;
  
  /**
   * OPTIONAL: Link a PR to the ticket.
   * 
   * @param ticketId - Ticket identifier
   * @param prUrl - Pull request URL
   * @returns Success status or error
   */
  linkPR?(ticketId: string, prUrl: string): Promise<AdapterResult<void>>;
  
  /**
   * OPTIONAL: Validate adapter configuration/connectivity.
   * 
   * @returns true if configured and reachable, error otherwise
   */
  validate?(): Promise<AdapterResult<boolean>>;
}
```

### Pattern 2: Adapter Factory

**What:** Factory function that returns adapter based on config

```typescript
// src/adapters/index.ts
import type { WorkTrackerContract } from '../contracts/work-tracker';
import { createJiraAdapter } from './jira-adapter';
import { createGitHubAdapter } from './github-adapter';
import { createPlaceholderAdapter } from './placeholder-adapter';

export function createWorkTrackerAdapter(
  type: 'jira' | 'github' | 'none',
  config?: Record<string, unknown>
): WorkTrackerContract {
  switch (type) {
    case 'jira':
      return createJiraAdapter(config);
    case 'github':
      return createGitHubAdapter(config);
    case 'none':
    default:
      return createPlaceholderAdapter();
  }
}
```

### Pattern 3: Update Conflict Detection Algorithm

**What:** Three-way comparison using SHA-256 hashes

**Algorithm:**
```
For each file in new version:
  1. Get originalHash from manifest (hash at install time)
  2. Get currentHash from filesystem (current file state)
  3. Get newHash from update source (new framework version)
  
  Compare:
  ┌─────────────────┬──────────────────┬────────────────────────────────┐
  │ originalHash    │ currentHash      │ Action                         │
  ├─────────────────┼──────────────────┼────────────────────────────────┤
  │ same            │ same             │ SAFE: Update file              │
  │ same            │ different        │ CONFLICT: User modified        │
  │ different       │ same             │ N/A (original = current)       │
  │ different       │ different        │ CONFLICT: Both modified        │
  │ (none - new)    │ (n/a)            │ SAFE: Add new file             │
  │ exists          │ deleted          │ CONFLICT: User deleted         │
  └─────────────────┴──────────────────┴────────────────────────────────┘
```

**Implementation:**
```typescript
// src/utils/update.ts
import { hashFile } from './manifest';

interface FileComparison {
  path: string;
  status: 'unchanged' | 'user-modified' | 'new' | 'deleted';
  originalHash: string | null;
  currentHash: string | null;
  newHash: string;
}

async function compareFiles(
  manifest: LucaManifest,
  newFiles: Map<string, string>, // path -> content
  cwd: string
): Promise<FileComparison[]> {
  const results: FileComparison[] = [];
  
  for (const [path, newContent] of newFiles) {
    const newHash = createHash('sha256').update(newContent).digest('hex');
    const manifestEntry = manifest.files[path];
    
    if (!manifestEntry) {
      // New file in update
      results.push({
        path,
        status: 'new',
        originalHash: null,
        currentHash: null,
        newHash,
      });
      continue;
    }
    
    const fullPath = join(cwd, path);
    let currentHash: string | null = null;
    
    try {
      currentHash = await hashFile(fullPath);
    } catch {
      // File was deleted by user
      results.push({
        path,
        status: 'deleted',
        originalHash: manifestEntry.originalHash,
        currentHash: null,
        newHash,
      });
      continue;
    }
    
    if (currentHash === manifestEntry.originalHash) {
      // User hasn't modified - safe to update
      results.push({
        path,
        status: 'unchanged',
        originalHash: manifestEntry.originalHash,
        currentHash,
        newHash,
      });
    } else {
      // User has modified - conflict
      results.push({
        path,
        status: 'user-modified',
        originalHash: manifestEntry.originalHash,
        currentHash,
        newHash,
      });
    }
  }
  
  return results;
}
```

### Pattern 4: Approval Configuration

**What:** Config schema extension for approval gates

```typescript
// Extended config.json schema
interface ApprovalConfig {
  /** Require approval before executing generated plans */
  plans: boolean;
  /** Require approval for destructive operations (file deletion, git force) */
  destructive: boolean;
  /** Require approval for external API calls */
  external: boolean;
  /** Custom approval triggers (regex patterns) */
  custom_triggers: string[];
}

// In config.json template
{
  "approvals": {
    "plans": true,
    "destructive": true,
    "external": true,
    "custom_triggers": []
  }
}
```

### Anti-Patterns to Avoid

- **Synchronous MCP calls:** Jira MCP is async, always await
- **Hardcoded adapter logic:** Use factory, not if/else in consuming code
- **Destructive updates without backup:** Always backup before update
- **Silent conflicts:** Always surface conflicts to user
- **Version check on every command:** Cache with update-notifier pattern

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Version notification | Custom npm fetch | update-notifier | Handles caching, timing, box UI |
| Shell execution | child_process | execa | Better error handling, cross-platform |
| File hashing | Custom crypto | Existing hashFile() | Already implemented in Phase 1 |
| Config deep merge | Object.assign | defu (existing) | Already used in Phase 1 |
| Version comparison | String comparison | semver | Handles pre-release, ranges, etc. |

**Key insight:** Phase 1 already solved many building blocks. Reuse `hashFile()`, `createManifest()`, `readManifest()` for update mechanism.

## Common Pitfalls

### Pitfall 1: MCP Server Availability

**What goes wrong:** Jira adapter fails when MCP server not running

**Why it happens:** MCP servers can be unavailable, misconfigured, or not authenticated

**How to avoid:** 
- Always validate adapter connectivity before operations
- Provide clear error message: "Jira MCP server not available. Check Cursor Settings → MCP"
- Offer fallback: "Continue with placeholder tickets? (PROJ-0000)"

**Warning signs:** "server errored" message from MCP calls

### Pitfall 2: gh CLI Not Installed

**What goes wrong:** GitHub adapter fails silently

**Why it happens:** `gh` CLI not installed or not authenticated

**How to avoid:**
```typescript
async function validateGhCli(): Promise<boolean> {
  try {
    const { stdout } = await execa('gh', ['auth', 'status']);
    return stdout.includes('Logged in');
  } catch {
    return false;
  }
}
```

**Warning signs:** "command not found: gh" errors

### Pitfall 3: Partial Update State

**What goes wrong:** Update fails midway, leaves inconsistent state

**Why it happens:** Error during file write, disk full, permission issue

**How to avoid:**
1. Create backup directory before any changes
2. Track all operations
3. On error, restore from backup
4. On success, remove backup

```typescript
const backupDir = join(cwd, '.luca-backup-' + Date.now());
try {
  // Copy existing files to backup
  await copyDir(lucaDir, backupDir);
  
  // Perform update
  await performUpdate();
  
  // Success - remove backup
  await rm(backupDir, { recursive: true });
} catch (error) {
  // Restore from backup
  await rm(lucaDir, { recursive: true });
  await copyDir(backupDir, lucaDir);
  await rm(backupDir, { recursive: true });
  throw error;
}
```

### Pitfall 4: Conflict Resolution UX

**What goes wrong:** Users confused about what to do with conflicts

**Why it happens:** Showing diffs without clear actions

**How to avoid:**
- Write conflicts to `.cursor/luca/conflicts/` with clear naming
- Show summary: "3 files updated, 2 conflicts detected"
- Provide next steps: "Review conflicts in .cursor/luca/conflicts/ and merge manually"
- Offer commands: "Run `npx luca update --accept-theirs` to accept all new versions"

### Pitfall 5: Approval Gate Bypass

**What goes wrong:** Destructive operations run without approval

**Why it happens:** Approval check not in call path

**How to avoid:**
- Create `checkApproval()` utility that reads config and prompts
- Call before any operation matching approval criteria
- Log all approval decisions for audit trail

```typescript
async function checkApproval(
  operation: string,
  config: LucaConfig
): Promise<boolean> {
  // Log for audit
  appendToAuditLog({ operation, timestamp: new Date().toISOString() });
  
  if (config.approvals?.destructive && isDestructive(operation)) {
    const confirmed = await p.confirm({
      message: `This operation is destructive: ${operation}. Continue?`,
    });
    return !p.isCancel(confirmed) && confirmed;
  }
  
  return true;
}
```

## Code Examples

Verified patterns from existing codebase and research:

### Jira Adapter Implementation

```typescript
// src/adapters/jira-adapter.ts
import type { WorkTrackerContract, WorkTicket, AdapterResult } from '../contracts/work-tracker';

/**
 * Jira adapter using environment variables for REST API access.
 * 
 * NOTE: For Cursor IDE integration, users should use Atlassian MCP directly.
 * This adapter provides fallback for CLI usage outside of agent context.
 * 
 * Required environment variables:
 * - JIRA_BASE_URL
 * - JIRA_USER_EMAIL
 * - JIRA_API_TOKEN
 */
export function createJiraAdapter(config?: Record<string, unknown>): WorkTrackerContract {
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_USER_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  
  return {
    name: 'jira' as const,
    
    async getTicket(ticketId: string): Promise<AdapterResult<WorkTicket>> {
      if (!baseUrl || !email || !token) {
        return {
          success: false,
          error: 'Jira not configured. Set JIRA_BASE_URL, JIRA_USER_EMAIL, JIRA_API_TOKEN',
        };
      }
      
      try {
        const response = await fetch(
          `${baseUrl}/rest/api/3/issue/${ticketId}?fields=summary,description,issuetype,priority,status,assignee`,
          {
            headers: {
              'Authorization': `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`,
              'Accept': 'application/json',
            },
          }
        );
        
        if (!response.ok) {
          if (response.status === 401) {
            return { success: false, error: 'Jira authentication failed. Check API token.' };
          }
          if (response.status === 404) {
            return { success: false, error: `Ticket ${ticketId} not found.` };
          }
          return { success: false, error: `Jira API error: ${response.status}` };
        }
        
        const data = await response.json();
        
        return {
          success: true,
          data: {
            id: ticketId,
            title: data.fields.summary,
            description: data.fields.description?.content?.[0]?.content?.[0]?.text || '',
            type: mapJiraType(data.fields.issuetype?.name),
            status: data.fields.status?.name || 'Unknown',
            priority: mapJiraPriority(data.fields.priority?.name),
            assignee: data.fields.assignee?.displayName,
            url: `${baseUrl}/browse/${ticketId}`,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: `Failed to fetch Jira ticket: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
      }
    },
    
    async validate(): Promise<AdapterResult<boolean>> {
      if (!baseUrl || !email || !token) {
        return {
          success: false,
          error: 'Missing required environment variables: JIRA_BASE_URL, JIRA_USER_EMAIL, JIRA_API_TOKEN',
        };
      }
      
      try {
        const response = await fetch(`${baseUrl}/rest/api/3/myself`, {
          headers: {
            'Authorization': `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`,
            'Accept': 'application/json',
          },
        });
        
        return response.ok 
          ? { success: true, data: true }
          : { success: false, error: `Jira API returned ${response.status}` };
      } catch (error) {
        return { success: false, error: `Cannot connect to Jira: ${error}` };
      }
    },
  };
}

function mapJiraType(type: string): WorkTicket['type'] {
  const typeMap: Record<string, WorkTicket['type']> = {
    'Bug': 'bug',
    'Story': 'story',
    'Task': 'task',
    'Epic': 'epic',
    'Sub-task': 'subtask',
  };
  return typeMap[type] || 'task';
}

function mapJiraPriority(priority: string): WorkTicket['priority'] {
  const priorityMap: Record<string, WorkTicket['priority']> = {
    'Highest': 'highest',
    'High': 'high',
    'Medium': 'medium',
    'Low': 'low',
    'Lowest': 'lowest',
  };
  return priorityMap[priority] || 'medium';
}
```

### GitHub Adapter Implementation

```typescript
// src/adapters/github-adapter.ts
import { execa } from 'execa';
import type { WorkTrackerContract, WorkTicket, AdapterResult } from '../contracts/work-tracker';

/**
 * GitHub Issues adapter using gh CLI.
 * 
 * Requires:
 * - gh CLI installed and authenticated (`gh auth login`)
 * - Current directory in a git repo with GitHub remote
 */
export function createGitHubAdapter(config?: Record<string, unknown>): WorkTrackerContract {
  return {
    name: 'github' as const,
    
    async getTicket(ticketId: string): Promise<AdapterResult<WorkTicket>> {
      // Extract issue number (handles "#123" or "123")
      const issueNumber = ticketId.replace(/^#/, '');
      
      try {
        const { stdout } = await execa('gh', [
          'issue', 'view', issueNumber,
          '--json', 'number,title,body,state,labels,assignees,url',
        ]);
        
        const issue = JSON.parse(stdout);
        
        return {
          success: true,
          data: {
            id: `#${issue.number}`,
            title: issue.title,
            description: issue.body || '',
            type: inferTypeFromLabels(issue.labels),
            status: issue.state,
            priority: inferPriorityFromLabels(issue.labels),
            assignee: issue.assignees?.[0]?.login,
            url: issue.url,
          },
        };
      } catch (error) {
        if (error instanceof Error && error.message.includes('not found')) {
          return { success: false, error: `Issue ${ticketId} not found` };
        }
        if (error instanceof Error && error.message.includes('gh: command not found')) {
          return { success: false, error: 'GitHub CLI (gh) not installed. Run: brew install gh' };
        }
        return {
          success: false,
          error: `Failed to fetch GitHub issue: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
      }
    },
    
    async createBranch(ticketId: string, branchName: string): Promise<AdapterResult<string>> {
      const issueNumber = ticketId.replace(/^#/, '');
      
      try {
        // Use gh issue develop to create linked branch
        await execa('gh', ['issue', 'develop', issueNumber, '--name', branchName]);
        return { success: true, data: branchName };
      } catch (error) {
        // Fall back to manual branch creation
        try {
          await execa('git', ['checkout', '-b', branchName]);
          return { success: true, data: branchName };
        } catch (gitError) {
          return {
            success: false,
            error: `Failed to create branch: ${gitError instanceof Error ? gitError.message : 'Unknown error'}`,
          };
        }
      }
    },
    
    async linkPR(ticketId: string, prUrl: string): Promise<AdapterResult<void>> {
      // GitHub automatically links PRs that mention issue numbers
      // This is handled via PR body containing "Closes #123" or "Fixes #123"
      return { success: true, data: undefined };
    },
    
    async validate(): Promise<AdapterResult<boolean>> {
      try {
        const { stdout } = await execa('gh', ['auth', 'status']);
        if (stdout.includes('Logged in')) {
          return { success: true, data: true };
        }
        return { success: false, error: 'gh CLI not authenticated. Run: gh auth login' };
      } catch {
        return { success: false, error: 'gh CLI not installed or not in PATH' };
      }
    },
  };
}

function inferTypeFromLabels(labels: Array<{ name: string }>): WorkTicket['type'] {
  const labelNames = labels.map(l => l.name.toLowerCase());
  if (labelNames.includes('bug')) return 'bug';
  if (labelNames.includes('enhancement') || labelNames.includes('feature')) return 'story';
  if (labelNames.includes('epic')) return 'epic';
  return 'task';
}

function inferPriorityFromLabels(labels: Array<{ name: string }>): WorkTicket['priority'] {
  const labelNames = labels.map(l => l.name.toLowerCase());
  if (labelNames.includes('critical') || labelNames.includes('urgent')) return 'highest';
  if (labelNames.includes('high') || labelNames.includes('priority')) return 'high';
  if (labelNames.includes('low')) return 'low';
  return 'medium';
}
```

### Placeholder Adapter Implementation

```typescript
// src/adapters/placeholder-adapter.ts
import type { WorkTrackerContract, WorkTicket, AdapterResult } from '../contracts/work-tracker';

/**
 * Placeholder adapter for projects without work tracking.
 * 
 * Returns synthetic ticket data using configured placeholder ID.
 * Useful for:
 * - Quick fixes without tickets
 * - Personal projects
 * - Documentation updates
 */
export function createPlaceholderAdapter(config?: Record<string, unknown>): WorkTrackerContract {
  const placeholderTicket = (config?.placeholderTicket as string) || 'PROJ-0000';
  
  return {
    name: 'none' as const,
    
    async getTicket(ticketId: string): Promise<AdapterResult<WorkTicket>> {
      // Return synthetic placeholder ticket
      return {
        success: true,
        data: {
          id: ticketId || placeholderTicket,
          title: 'Untracked work',
          description: 'Work not associated with a tracked ticket',
          type: 'task',
          status: 'In Progress',
          priority: 'medium',
          url: '',
        },
      };
    },
    
    async validate(): Promise<AdapterResult<boolean>> {
      // Placeholder is always valid
      return { success: true, data: true };
    },
  };
}
```

### Update Command Structure

```typescript
// src/commands/update.ts
import { defineCommand } from 'citty';
import * as p from '@clack/prompts';
import { logger } from '../utils/logger';
import { readManifest, hashFile } from '../utils/manifest';
import { join } from 'pathe';
import { existsSync } from 'fs';
import { copyFile, rm, mkdir } from 'fs/promises';

export const updateCommand = defineCommand({
  meta: {
    name: 'update',
    description: 'Update Luca framework to the latest version',
  },
  args: {
    force: {
      type: 'boolean',
      description: 'Force update, overwriting user modifications',
      default: false,
    },
    'dry-run': {
      type: 'boolean',
      description: 'Show what would be updated without making changes',
      default: false,
    },
    'accept-theirs': {
      type: 'boolean',
      description: 'Accept all new framework versions for conflicts',
      default: false,
    },
    'accept-mine': {
      type: 'boolean',
      description: 'Keep all user modifications, skip conflicting files',
      default: false,
    },
  },
  async run({ args }) {
    const cwd = process.cwd();
    
    // 1. Read existing manifest
    const manifest = await readManifest(cwd);
    if (!manifest) {
      logger.error('Luca not installed. Run `npx luca init` first.');
      process.exit(1);
    }
    
    // 2. Check for updates from npm registry
    // (Implementation would fetch latest version from registry)
    
    // 3. Compare files and detect conflicts
    // 4. Backup existing files
    // 5. Apply updates
    // 6. Handle conflicts
    // 7. Update manifest
    
    p.outro('✅ Update complete!');
  },
});
```

### Version Notification Integration

```typescript
// src/utils/version-check.ts
import updateNotifier from 'update-notifier';
import { readFileSync } from 'fs';
import { join, dirname } from 'pathe';
import { fileURLToPath } from 'url';

/**
 * Check for updates and notify user (non-blocking).
 * 
 * Uses update-notifier which:
 * - Runs check in background subprocess
 * - Caches results (default: 24 hours)
 * - Shows notification box if update available
 */
export function checkForUpdates(): void {
  try {
    // Load package.json
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const packageJsonPath = join(currentDir, '..', '..', 'package.json');
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    
    // Initialize notifier
    const notifier = updateNotifier({
      pkg,
      updateCheckInterval: 1000 * 60 * 60 * 24, // 24 hours
    });
    
    // Notify if update available (non-blocking)
    notifier.notify({
      message: `Update available: ${notifier.update?.current} → ${notifier.update?.latest}\nRun: npx luca update`,
      defer: false,
    });
  } catch {
    // Silently ignore version check errors
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| MCP-only Jira | REST API + MCP guidance | Phase 2 | Works outside agent context |
| inquirer conflicts | @clack/prompts | 2023 | Better UX for conflict resolution |
| manual npm version check | update-notifier | Established | Handles caching, timing |
| string version compare | semver library | Established | Handles pre-release, ranges |

**Deprecated/outdated:**
- **Direct MCP calls from CLI:** MCP is agent-context only, CLI uses REST API with MCP documentation
- **Synchronous version checks:** Always use async/background check pattern

## Open Questions

Things that couldn't be fully resolved:

1. **MCP Server Wrapper for CLI**
   - What we know: MCP servers work in agent context, not directly from CLI
   - What's unclear: Whether to provide CLI fallback or require agent context
   - Recommendation: Jira adapter uses REST API as fallback, documents MCP for agent use

2. **Conflict Resolution Merge Tool**
   - What we know: Need to show conflicts, provide resolution
   - What's unclear: Whether to attempt automatic merge or always manual
   - Recommendation: Start with manual resolution in `.cursor/luca/conflicts/`, add --interactive merge later

3. **Update Source Distribution**
   - What we know: Templates bundled in npm package
   - What's unclear: Whether to pull updates from npm or GitHub releases
   - Recommendation: Pull from npm package for consistency with initial install

4. **Approval Audit Trail Format**
   - What we know: Need to log approval decisions
   - What's unclear: Where to store audit trail
   - Recommendation: `.planning/audit.log` with ISO timestamps, append-only

## Sources

### Primary (HIGH confidence)
- Phase 1 codebase analysis - manifest.ts, wizard.ts, files.ts patterns
- Existing atlassian-mcp.mdc rule - MCP tool documentation
- jira-issue/SKILL.md - Jira REST API patterns
- GitHub CLI manual (cli.github.com) - gh issue commands

### Secondary (MEDIUM confidence)
- update-notifier npm package - Version notification patterns
- WebSearch: TypeScript adapter pattern best practices - Interface design
- WebSearch: npm CLI update mechanism - Conflict detection approaches

### Tertiary (LOW confidence)
- None - all key findings verified with primary/secondary sources

## Metadata

**Confidence breakdown:**
- WorkTrackerContract design: HIGH - Based on TypeScript best practices and existing adapter patterns
- Jira adapter: HIGH - REST API documented, MCP patterns from existing rules
- GitHub adapter: HIGH - gh CLI well-documented, commands verified
- Update mechanism: HIGH - Algorithm based on existing manifest.ts, standard hash comparison
- Approval configuration: MEDIUM - Schema design straightforward, audit trail format TBD

**Research date:** 2026-02-04
**Valid until:** 2026-03-04 (30 days - stable patterns)

## Implementation Recommendations

### Priority Order
1. **WorkTrackerContract + Factory** - Foundation for all adapters
2. **Placeholder Adapter** - Simplest, validates contract design
3. **GitHub Adapter** - gh CLI is reliable, easier to test
4. **Jira Adapter** - More complex auth, REST API fallback
5. **Update Command** - Requires manifest.ts enhancements
6. **Version Notification** - Simple integration with update-notifier
7. **Approval Configuration** - Config schema extension

### Files to Create/Modify

**New Files:**
- `src/contracts/work-tracker.ts` - Contract interface
- `src/adapters/index.ts` - Factory function
- `src/adapters/jira-adapter.ts` - Jira implementation
- `src/adapters/github-adapter.ts` - GitHub implementation
- `src/adapters/placeholder-adapter.ts` - Placeholder implementation
- `src/commands/update.ts` - Update command
- `src/utils/version-check.ts` - Version notification

**Modified Files:**
- `src/index.ts` - Add update command to subCommands
- `src/types.ts` - Add ApprovalConfig type
- `src/utils/manifest.ts` - Add update comparison functions
- `templates/base/.planning/config.json` - Add approvals section

### Reuse from Phase 1
- `hashFile()` from manifest.ts - File hash calculation
- `createManifest()` / `readManifest()` / `writeManifest()` - Manifest operations
- `copyTemplates()` from template.ts - File copying with processing
- @clack/prompts patterns from wizard.ts - User interaction
- citty defineCommand pattern from init.ts - Command structure
