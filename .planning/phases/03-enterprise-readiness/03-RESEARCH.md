# Phase 3: Enterprise Readiness - Research

**Researched:** 2026-02-04
**Domain:** CLI diagnostics, security documentation, enterprise support
**Confidence:** HIGH

## Summary

Phase 3 requires implementing three core deliverables: a diagnostic `doctor` command, comprehensive security documentation, and enterprise support materials. The research identifies established patterns from tools like Flutter Doctor and Homebrew, security documentation templates from OSSF, and best practices for enterprise vendor assessments.

**Key findings:**
- Doctor commands follow a standard pattern: scan system state, report with visual indicators (✓/✗), provide remediation steps
- Security documentation should align with OWASP best practices and OSSF templates
- Enterprise questionnaires need structured templates covering data handling, access control, and audit capabilities
- TUI libraries: @clack/prompts (already in use) sufficient for doctor command; Ink available for complex interactive UIs
- MCP validation requires checking `.cursor/mcp.json` structure and server connectivity
- Secret redaction critical for enterprise-safe output sharing

**Primary recommendation:** Use @clack/prompts for doctor command (already in dependencies), follow OSSF SECURITY.md template structure, implement comprehensive checks with clear remediation guidance.

## Standard Stack

### Core Libraries

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @clack/prompts | ^1.0.0 | Interactive prompts and spinners | Already in codebase, sufficient for doctor command |
| consola | ^3.4.0 | Logging with tagged output | Already in codebase, used for all CLI output |
| fast-redact | ^3.0.0+ | Secret redaction from objects | Industry standard for sanitizing sensitive output |
| zod | (via pkg-types) | Config validation | Already used for type-safe config parsing |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| ink | ^4.0.0+ | React-based TUI framework | Only if complex interactive UI needed (not required for doctor) |
| pastel | ^4.0.0+ | Next.js-inspired CLI framework | Only if building full CLI framework (overkill for single command) |
| semver | ^7.7.3 | Version comparison | Already in codebase, use for framework version checks |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @clack/prompts | ink + react | More complex setup, larger bundle, but more flexible UI |
| fast-redact | manual regex | fast-redact handles nested objects, wildcards, edge cases |
| consola | chalk | consola provides structured logging, tagged output, box formatting |

**Installation:**
```bash
bun add fast-redact
# @clack/prompts, consola, semver already installed
```

## Architecture Patterns

### Recommended Project Structure

```
packages/luca-framework/src/
├── commands/
│   ├── init.ts          # Existing
│   ├── update.ts        # Existing
│   └── doctor.ts        # New: Diagnostic command
├── utils/
│   ├── detect.ts        # Existing: Project context detection
│   ├── logger.ts        # Existing: Logging utilities
│   ├── redact.ts        # New: Secret redaction utilities
│   └── mcp-validator.ts # New: MCP server validation
└── types.ts             # Existing: Type definitions
```

### Pattern 1: Doctor Command Structure

**What:** Follow Flutter Doctor / Homebrew Doctor pattern: scan → report → remediate

**When to use:** All diagnostic commands should follow this pattern

**Structure:**
```typescript
// Source: Flutter Doctor pattern, adapted for Luca
export const doctorCommand = defineCommand({
  meta: {
    name: 'doctor',
    description: 'Check Luca installation and environment health',
  },
  args: {
    verbose: {
      type: 'boolean',
      description: 'Show detailed diagnostic information',
      alias: 'v',
    },
  },
  async run({ args }) {
    const checks = [
      checkNodeVersion(),
      checkCursorIDE(),
      checkMCPConfig(),
      checkFrameworkVersion(),
      checkConfigValidation(),
      checkNetworkConnectivity(), // Optional: deep diagnostics
    ];

    const results = await Promise.all(checks);
    displayResults(results, args.verbose);
    
    const exitCode = results.every(r => r.status === 'pass') ? 0 : 1;
    process.exit(exitCode);
  },
});
```

**Check Result Interface:**
```typescript
interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  remediation?: string[];
  details?: string; // Shown in verbose mode
}
```

### Pattern 2: Secret Redaction

**What:** Redact all secrets/API keys from diagnostic output before display

**When to use:** Any output that might be shared (doctor command, error logs, debug output)

**Example:**
```typescript
// Source: fast-redact npm package
import fastRedact from 'fast-redact';

const redact = fastRedact({
  paths: [
    'env.*_API_KEY',
    'env.*_TOKEN',
    'env.*_SECRET',
    'config.mcp.*.env.*',
    '*.password',
    '*.secret',
  ],
  censor: '[REDACTED]',
});

// Usage
const sanitized = redact(sensitiveObject);
logger.info(sanitized);
```

### Pattern 3: MCP Server Validation

**What:** Validate `.cursor/mcp.json` structure and detect common configuration issues

**When to use:** Doctor command, init command (optional validation)

**Example:**
```typescript
// Validate MCP config structure
async function validateMCPConfig(cwd: string): Promise<CheckResult> {
  const mcpPath = join(cwd, '.cursor', 'mcp.json');
  
  if (!existsSync(mcpPath)) {
    return {
      name: 'MCP Configuration',
      status: 'warn',
      message: '.cursor/mcp.json not found',
      remediation: [
        'MCP servers are optional but recommended for full functionality',
        'Configure MCP servers in Cursor Settings → MCP',
      ],
    };
  }

  try {
    const config = JSON.parse(await readFile(mcpPath, 'utf-8'));
    
    // Validate structure
    if (!Array.isArray(config.mcpServers)) {
      return {
        name: 'MCP Configuration',
        status: 'fail',
        message: 'Invalid mcp.json structure',
        remediation: ['mcpServers must be an array'],
      };
    }

    // Check for common issues
    const issues: string[] = [];
    for (const server of config.mcpServers) {
      if (!server.name) issues.push(`Server missing name`);
      if (server.command && !existsSync(server.command.split(' ')[0])) {
        issues.push(`Server ${server.name}: command not found`);
      }
    }

    return {
      name: 'MCP Configuration',
      status: issues.length > 0 ? 'warn' : 'pass',
      message: issues.length > 0 ? `Found ${issues.length} issue(s)` : 'Valid',
      remediation: issues,
    };
  } catch (error) {
    return {
      name: 'MCP Configuration',
      status: 'fail',
      message: 'Failed to parse mcp.json',
      remediation: ['Check JSON syntax', 'Validate file encoding'],
    };
  }
}
```

### Pattern 4: Security Documentation Structure

**What:** Follow OSSF SECURITY.md template with OWASP alignment

**When to use:** All open source projects requiring enterprise adoption

**Structure:**
```markdown
# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

[Contact information and process]

## Security Posture

### Data Handling
[What data is accessed, what leaves the machine]

### Access Control
[How approvals work, least privilege]

### Audit Trail
[What actions are logged, how to review]

### Supply Chain Security
[Version pinning, dependency management]

## Compliance

[OWASP alignment, general best practices]
```

### Anti-Patterns to Avoid

- **Auto-fix in doctor command:** User decision required per CONTEXT.md - report only, don't auto-remediate
- **Complex TUI for simple checks:** @clack/prompts sufficient, don't add Ink unless interactive UI needed
- **Hardcoded remediation steps:** Use configurable remediation messages based on detected issues
- **Exposing secrets in output:** Always redact before display, even in verbose mode
- **SOC 2 specific claims:** Per CONTEXT.md, focus on general best practices, not specific certifications

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Secret redaction | Manual regex patterns | fast-redact | Handles nested objects, wildcards, edge cases, performance optimized |
| Version comparison | String parsing | semver (already installed) | Handles pre-release versions, ranges, proper semver semantics |
| Terminal UI | Raw ANSI codes | @clack/prompts (already installed) | Cross-platform, accessible, well-tested |
| Config validation | Manual checks | zod (via existing patterns) | Type-safe, comprehensive validation |

**Key insight:** The codebase already has most dependencies needed. Only fast-redact needs to be added for secret redaction.

## Common Pitfalls

### Pitfall 1: MCP Server Validation False Positives

**What goes wrong:** Doctor command reports MCP servers as "broken" when they're actually fine, or misses real issues

**Why it happens:** 
- MCP servers run in separate processes, can't directly test connectivity
- `.cursor/mcp.json` structure varies by Cursor version
- Some servers use OAuth (no API keys to validate)

**How to avoid:**
- Validate JSON structure and required fields only
- Check if command/executable exists (don't test connectivity)
- Provide clear guidance: "If MCP tools work in Cursor, this check can be ignored"
- Don't fail doctor command if MCP optional

**Warning signs:**
- Doctor command fails when MCP actually works
- Users report false positives

### Pitfall 2: Secret Redaction Too Aggressive

**What goes wrong:** Redacts legitimate diagnostic information, making output useless

**Why it happens:** Overly broad patterns match non-secret data (e.g., "api_url" redacted)

**How to avoid:**
- Use specific patterns: `*_API_KEY`, `*_TOKEN`, `*_SECRET`
- Test redaction with sample outputs
- Provide verbose mode that shows redacted locations without values
- Allow users to review before sharing

**Warning signs:**
- Diagnostic output shows `[REDACTED]` for non-secret fields
- Users can't debug issues due to over-redaction

### Pitfall 3: Security Documentation Too Generic

**What goes wrong:** SECURITY.md doesn't address enterprise concerns, gets rejected by security teams

**Why it happens:** Copy-paste template without Luca-specific details

**How to avoid:**
- Document actual data flows: what Luca accesses, what leaves machine
- Explain approval system clearly (per REQ-004)
- Provide audit trail examples (git commits, planning artifacts)
- Address supply chain: how updates work, version pinning guidance
- Reference OWASP but be specific to Luca

**Warning signs:**
- Security teams ask follow-up questions not answered in docs
- Enterprise pilots stall at security review

### Pitfall 4: Doctor Command Exit Codes

**What goes wrong:** Scripts using `luca doctor` can't detect failures reliably

**Why it happens:** Exit code 0 even when issues found, or exit 1 for warnings

**How to avoid:**
- Exit 0: All checks pass
- Exit 1: Any check fails (not warnings)
- Document exit code behavior in help text
- Provide `--json` output option for scripting

**Warning signs:**
- CI/CD scripts can't detect doctor failures
- Users confused about when command "succeeded"

## Code Examples

### Doctor Command Implementation

```typescript
// commands/doctor.ts
import { defineCommand } from 'citty';
import * as p from '@clack/prompts';
import { logger } from '../utils/logger';
import { redactSecrets } from '../utils/redact';
import {
  checkNodeVersion,
  checkCursorIDE,
  checkMCPConfig,
  checkFrameworkVersion,
  checkConfigValidation,
} from '../utils/doctor-checks';

interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  remediation?: string[];
  details?: string;
}

function displayResults(results: CheckResult[], verbose: boolean): void {
  logger.info('\nLuca Doctor Results:\n');

  for (const result of results) {
    const icon = result.status === 'pass' ? '✓' : result.status === 'fail' ? '✗' : '⚠';
    const color = result.status === 'pass' ? 'green' : result.status === 'fail' ? 'red' : 'yellow';
    
    logger[result.status === 'pass' ? 'success' : result.status === 'fail' ? 'error' : 'warn'](
      `${icon} ${result.name}: ${result.message}`
    );

    if (result.remediation && result.remediation.length > 0) {
      logger.info('  Remediation:');
      for (const step of result.remediation) {
        logger.info(`    - ${step}`);
      }
    }

    if (verbose && result.details) {
      logger.debug(`  Details: ${redactSecrets(result.details)}`);
    }
  }

  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const warned = results.filter(r => r.status === 'warn').length;

  logger.box(`
Summary:
  Passed:  ${passed}
  Warnings: ${warned}
  Failed:  ${failed}
  `);
}

export const doctorCommand = defineCommand({
  meta: {
    name: 'doctor',
    description: 'Check Luca installation and environment health',
  },
  args: {
    verbose: {
      type: 'boolean',
      description: 'Show detailed diagnostic information',
      alias: 'v',
      default: false,
    },
  },
  async run({ args }) {
    p.intro('Running Luca Doctor...');

    const checks = [
      await checkNodeVersion(),
      await checkCursorIDE(),
      await checkMCPConfig(process.cwd()),
      await checkFrameworkVersion(process.cwd()),
      await checkConfigValidation(process.cwd()),
    ];

    displayResults(checks, args.verbose);

    const hasFailures = checks.some(r => r.status === 'fail');
    
    if (hasFailures) {
      p.cancel('Some checks failed. Review remediation steps above.');
      process.exit(1);
    } else {
      p.outro('All checks passed!');
      process.exit(0);
    }
  },
});
```

### Secret Redaction Utility

```typescript
// utils/redact.ts
import fastRedact from 'fast-redact';

const redactor = fastRedact({
  paths: [
    // Environment variables
    'env.*_API_KEY',
    'env.*_TOKEN',
    'env.*_SECRET',
    'env.*_PASSWORD',
    // MCP config secrets
    'mcp.*.env.*',
    'config.mcp.*.env.*',
    // Common secret field names
    '*.password',
    '*.secret',
    '*.token',
    '*.apiKey',
    '*.api_key',
  ],
  censor: '[REDACTED]',
  serialize: (o) => JSON.stringify(o, null, 2),
});

export function redactSecrets<T>(obj: T): string {
  return redactor(obj as Record<string, unknown>);
}

export function redactString(str: string, patterns: RegExp[]): string {
  let redacted = str;
  for (const pattern of patterns) {
    redacted = redacted.replace(pattern, '[REDACTED]');
  }
  return redacted;
}
```

### Node.js Version Check

```typescript
// utils/doctor-checks.ts
import { readFile } from 'fs/promises';
import { join } from 'pathe';
import type { CheckResult } from '../types';

export async function checkNodeVersion(): Promise<CheckResult> {
  const version = process.version;
  const major = parseInt(version.slice(1).split('.')[0], 10);
  const required = 18;

  if (major >= required) {
    return {
      name: 'Node.js Version',
      status: 'pass',
      message: `v${major} (required: v${required}+)`,
    };
  }

  return {
    name: 'Node.js Version',
    status: 'fail',
    message: `v${major} (required: v${required}+)`,
    remediation: [
      `Upgrade Node.js to v${required} or higher`,
      'Use nvm: `nvm install ${required}`',
      'Or download from https://nodejs.org/',
    ],
  };
}
```

### Cursor IDE Detection

```typescript
// Note: No reliable programmatic detection method found
// Check for Cursor-specific files or environment variables
export async function checkCursorIDE(): Promise<CheckResult> {
  // Check for Cursor-specific indicators
  const cursorPaths = [
    join(process.env.HOME || '', '.cursor'),
    join(process.env.HOME || '', 'Library', 'Application Support', 'Cursor'),
  ];

  const hasCursor = cursorPaths.some(p => existsSync(p));

  if (hasCursor) {
    return {
      name: 'Cursor IDE',
      status: 'pass',
      message: 'Cursor IDE detected',
      details: 'Cursor-specific directories found',
    };
  }

  return {
    name: 'Cursor IDE',
    status: 'warn',
    message: 'Cursor IDE not detected',
    remediation: [
      'Luca is designed for Cursor IDE',
      'Install Cursor from https://cursor.com/',
      'If using Cursor, this check may be inaccurate',
    ],
    details: 'Detection is best-effort and may have false negatives',
  };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual secret filtering | fast-redact library | 2024+ | Handles nested objects, wildcards, better performance |
| Basic doctor output | Interactive TUI with @clack/prompts | 2023+ | Better UX, clearer status indicators |
| Generic security docs | OWASP-aligned templates | 2024+ | Enterprise teams expect structured, comprehensive docs |

**Deprecated/outdated:**
- Manual regex for secret redaction: Use fast-redact for reliability
- Plain text doctor output: Use @clack/prompts for better UX
- Minimal security docs: Enterprise requires comprehensive documentation

## Open Questions

1. **Cursor IDE Detection Reliability**
   - What we know: No standard programmatic detection method exists
   - What's unclear: Best way to detect Cursor without false negatives
   - Recommendation: Use best-effort detection (check common paths), mark as warning not failure

2. **MCP Server Health Checks**
   - What we know: Can validate JSON structure, check if executables exist
   - What's unclear: How to test actual MCP server connectivity without Cursor running
   - Recommendation: Validate structure only, provide guidance that "if MCP works in Cursor, ignore this check"

3. **Network Connectivity Testing**
   - What we know: CONTEXT.md mentions network latency/connectivity checks
   - What's unclear: Which endpoints to test (GitHub API? Jira? Generic connectivity?)
   - Recommendation: Test GitHub API connectivity (most common), make configurable for enterprise air-gapped environments

## Sources

### Primary (HIGH confidence)

- **Flutter Doctor Pattern** - WebSearch verified: Standard diagnostic command pattern with visual indicators and remediation steps
- **fast-redact npm package** - Official npm package documentation: Industry standard for secret redaction
- **@clack/prompts** - Already in codebase: Sufficient for doctor command interactive output
- **OSSF Security Templates** - GitHub ossf/oss-vulnerability-guide: Official SECURITY.md templates for open source projects
- **OWASP Best Practices** - WebSearch verified: General security best practices alignment

### Secondary (MEDIUM confidence)

- **Ink/Pastel TUI Libraries** - WebSearch + GitHub: Available but not required for doctor command (overkill)
- **MCP Health Check Patterns** - WebSearch: MCPcat guides on health checks (structure validation approach)
- **Enterprise Questionnaire Templates** - WebSearch: Vendor assessment patterns (structure for questionnaire template)

### Tertiary (LOW confidence)

- **Cursor IDE Detection** - WebSearch: No reliable method found, best-effort approach recommended
- **Network Endpoint Testing** - CONTEXT.md mentions but specifics unclear, recommend GitHub API as default

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Libraries already in use or well-established
- Architecture: HIGH - Patterns follow established CLI diagnostic conventions
- Pitfalls: HIGH - Based on codebase analysis and common CLI tool issues
- Security docs: HIGH - OSSF templates provide authoritative structure
- MCP validation: MEDIUM - Structure validation straightforward, connectivity testing unclear
- Cursor detection: LOW - No reliable method, best-effort approach

**Research date:** 2026-02-04
**Valid until:** 2026-03-04 (30 days - stable domain, libraries well-established)
