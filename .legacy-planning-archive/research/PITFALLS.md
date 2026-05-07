# Domain Pitfalls

**Domain:** CLI-installable agent development framework for Cursor IDE
**Researched:** 2026-02-04
**Focus:** Enterprise adoption, distribution, security, DX

---

## Critical Pitfalls

Mistakes that cause security incidents, enterprise rejection, or require major rewrites.

### Pitfall 1: IDE Extension Supply Chain Vulnerabilities

**What goes wrong:** Malicious actors exploit trust in IDE extensions through leaked tokens, namespace squatting, or compromised auto-updates.

**Why it happens:** IDE marketplaces have weak vetting. Cursor and VS Code auto-update extensions, meaning a single compromised Personal Access Token (PAT) can distribute malware to 150,000+ installs instantly.

**Recent incidents (2025-2026):**
- **Wiz Research (Oct 2025):** 550+ secrets leaked in VS Code extensions, including 100+ valid marketplace PATs affecting 85,000+ extensions
- **Koi Security (Jan 2026):** AI IDE forks (Cursor, Windsurf) contained hardcoded "recommended" extensions pointing to unclaimed OpenVSX namespaces—attackers could register and publish malicious extensions
- **CVE-2025-52882:** Claude Code websocket vulnerability allowing arbitrary file reading from attacker-controlled webpages

**Consequences:**
- Enterprise security teams reject tools with supply chain risk
- Data exfiltration (AI provider keys, AWS credentials, database secrets)
- Reputation damage that's nearly impossible to recover from

**Prevention:**
- **DO NOT** distribute as IDE extension—use CLI-based approach (already planned)
- Never hardcode extension recommendations or dependencies
- Audit all dependencies for leaked secrets before release
- Implement provenance verification (SLSA, Sigstore) for releases
- Document supply chain security posture for enterprise security reviews

**Detection:**
- Monitor npm audit reports for dependency vulnerabilities
- Scan published packages for accidental secret exposure
- Track CVE databases for IDE-related vulnerabilities

**Confidence:** HIGH (verified via Wiz Research, Koi Security reports, NVD)

---

### Pitfall 2: npm Lifecycle Script Attack Surface

**What goes wrong:** `postinstall` and `preinstall` scripts execute arbitrary code during installation with user privileges, creating supply chain attack vectors.

**Why it happens:** npm's lifecycle hooks run automatically. Attackers compromise dependencies and inject credential harvesting, backdoors, or malware into install scripts.

**Recent incidents (2025):**
- **Shai-Hulud attack:** 600+ packages from vendors (Zapier, PostHog, Postman) compromised via malicious `postinstall` hooks
- Build agents in CI/CD especially vulnerable—have broad secrets access

**Consequences:**
- Enterprise CI/CD systems compromised
- npm tokens, GitHub credentials, cloud provider keys harvested
- Backdoored artifacts signed and published

**Prevention:**
- **Minimize lifecycle script usage**—prefer explicit user commands over auto-running scripts
- Document required post-install steps rather than auto-executing
- If scripts are necessary:
  - Use `npx luca init` pattern (explicit user invocation) not `postinstall`
  - Consider Bun's "default-secure" model: scripts blocked by default, require explicit `trustedDependencies`
- For enterprise:
  - Recommend `--ignore-scripts` in CI with explicit allowlisting
  - Use lockfile pinning (`npm ci`, `pnpm install --frozen-lockfile`)
  - Private registry mirrors with malware scanning

**Detection:**
- Monitor for unexpected network egress during install
- Audit `package.json` for lifecycle scripts
- Review dependency changes in PRs

**Confidence:** HIGH (verified via Snyk, npm security advisories)

---

### Pitfall 3: Enterprise Security Perception Gap

**What goes wrong:** Leadership approves AI tools while security practitioners remain skeptical, creating friction, shadow IT, or outright rejection.

**Why it happens:** C-suite rates AI-generated code security as "excellent" (29.8%), while AppSec teams rate it "bad" at 2x the rate. Leadership underestimates implementation-layer risks.

**Statistics (2025):**
- C-suite "extremely ready" for AI: 40.3%
- AppSec "extremely ready": 26%
- Developers "extremely ready": 22.4%
- <20% of organizations did proof-of-concept before deploying AI tools
- >33% implemented no new security measures

**Consequences:**
- Security teams block adoption
- Compliance delays
- Tools deployed without proper guardrails (then blamed for incidents)

**Prevention:**
- **Target security practitioners, not just leadership**—speak their language
- Provide SOC 2-relevant documentation:
  - Audit trail capabilities (who, what, when, outcome)
  - Evidence collection features for compliance
  - Access control mechanisms
- Offer proof-of-concept guidance in documentation
- Document security posture explicitly:
  - What data Luca accesses
  - What data leaves the machine (if any)
  - How approvals work
  - How to audit agent actions

**Detection:**
- Enterprise pilots stalling without explanation (likely security hold)
- Security questionnaire requests

**Confidence:** HIGH (verified via Snyk 2025 AI Readiness Report)

---

### Pitfall 4: MCP Server Connection Fragility

**What goes wrong:** MCP servers fail silently with cryptic errors ("Client Closed", "failed to create client"), blocking core functionality.

**Why it happens:** Cursor's MCP implementation has:
- Multiple registration systems that don't communicate
- Poor error logging (doesn't surface actual command output)
- Dependency on runtime environments (Node.js version, Python, etc.)

**Common causes:**
- Node.js version mismatch (v14 fails, v20+ required)
- Dual registration conflict (provider-based vs config-based)
- Missing environment dependencies
- Path resolution failures

**Consequences:**
- Users assume Luca is broken when MCP is the problem
- Support burden increases
- Enterprise deployments fail in controlled environments

**Prevention:**
- **Detect and report MCP issues clearly**—wrap MCP calls with better error handling
- Document minimum requirements explicitly (Node.js 20+)
- Provide diagnostic commands (`luca doctor` or similar)
- Consider graceful degradation for non-critical MCP features
- Test across Cursor versions (MCP stability varies significantly)

**Detection:**
- `~/.cursor/mcp.json` parsing failures
- MCP server status checks in Cursor settings
- Runtime version detection at init

**Confidence:** HIGH (verified via Cursor forum reports, GitHub issues)

---

## Moderate Pitfalls

Mistakes that cause delays, technical debt, or degraded user experience.

### Pitfall 5: Time-to-First-Value Exceeds Tolerance

**What goes wrong:** Users abandon onboarding before seeing value, creating negative perception and failed adoption.

**Benchmarks:**
- Expected time to first value: ~1 day 12 hours (SaaS average)
- Developer tools: 70-minute time-to-first-PR is achievable with good design
- 48% of customers abandon if value isn't immediate
- 52% of CS leaders admit onboarding is "more confusing than necessary"

**Why it happens:**
- Too many configuration steps before any output
- Unclear "what do I do now?" after install
- Prerequisites not checked upfront
- First experience is error, not success

**Consequences:**
- Initial users churn before evangelizing
- "I tried it, it didn't work" word-of-mouth
- Lost momentum during adoption window

**Prevention:**
- **Zero-config default path**—`npx luca init` should produce working state with no questions
- Delay optional configuration until after first success
- Check prerequisites (Node.js version, Git, Cursor) immediately with clear remediation
- Provide immediate next action: "Run `/lu-help` in Cursor to see what Luca can do"
- Design for "working in 5 minutes" goal (stated in PROJECT.md)

**Detection:**
- Track funnel: init started → init completed → first command → continued usage
- Monitor error rates at each step

**Confidence:** HIGH (verified via Atlassian DX Report, onboarding research)

---

### Pitfall 6: npm Package Configuration Errors

**What goes wrong:** CLI doesn't work after `npm install -g` due to misconfigured `package.json`.

**Common errors:**
- Missing or incorrect `bin` field
- Missing shebang (`#!/usr/bin/env node`) in executable
- Incorrect file paths (relative path resolution)
- Missing execute permissions on POSIX systems
- Windows compatibility (JScript interpreter instead of Node.js)

**Consequences:**
- "command not found" errors
- "No such file or directory" errors
- Works on developer machine, fails for users
- Platform-specific failures (works on Mac, fails on Windows)

**Prevention:**
```json
{
  "name": "luca",
  "bin": {
    "luca": "./bin/luca.js"
  },
  "files": ["bin", "lib"]
}
```
- Ensure shebang: `#!/usr/bin/env node`
- Test on clean machine before publish
- Test on all target platforms (Mac, Linux, Windows)
- Use `npm link` during development to simulate global install
- Include only necessary files via `files` field

**Detection:**
- Test global install in CI across platforms
- Smoke test after npm publish

**Confidence:** HIGH (verified via npm documentation)

---

### Pitfall 7: Global Install Permission Issues

**What goes wrong:** Users encounter `EACCES` permission errors when installing globally, leading them to use `sudo` (which causes further problems).

**Why it happens:**
- Default npm prefix is `/usr/local` which requires root
- Users without nvm/fnm/volta have system Node.js installation
- `sudo npm install -g` creates root-owned files in user directories

**Consequences:**
- Users give up during installation
- `sudo` usage creates permission mess in subsequent operations
- Support tickets for environment-specific issues

**Prevention:**
- **Recommend `npx luca init` over global install**—avoids permission issues entirely
- If global install needed, document nvm/fnm/volta as prerequisite
- Provide `npm config set prefix ~/.local` guidance
- Never require `sudo` in any documentation

**Detection:**
- EACCES errors in install logs
- Files owned by root in user directories

**Confidence:** HIGH (verified via npm documentation)

---

### Pitfall 8: Config Drift Across Team

**What goes wrong:** Team members have different Luca configurations, causing inconsistent behavior and "works on my machine" issues.

**Why it happens:**
- `.planning/config.json` edited manually with different values
- Local overrides not synchronized
- Version mismatches (some team members updated, others didn't)
- Environment-specific paths hardcoded

**Consequences:**
- Different approval workflows per developer
- Agent behavior inconsistency
- Debugging requires knowing which config variant

**Prevention:**
- **Config should be version-controlled**—`.planning/` is already git-tracked
- Provide `luca config validate` command
- Document which config values are team-shared vs personal
- Consider `.planning/config.local.json` for personal overrides (gitignored)
- Include config version in Luca version checks

**Detection:**
- `luca doctor` command comparing local config to expected schema
- Config validation on init

**Confidence:** MEDIUM (derived from infrastructure config drift patterns)

---

### Pitfall 9: Breaking Changes Without Migration Path

**What goes wrong:** Framework updates break existing installations, users lose trust, enterprise teams freeze versions indefinitely.

**Why it happens:**
- Semver not followed strictly
- Config schema changes without migration
- File paths or naming conventions changed
- API changes without deprecation period

**Statistics:**
- 74% of enterprises report MORE tool sprawl after migration attempts
- 68% found consolidation reduced productivity
- Average enterprise migration: $1.75M, 40% deliver less ROI than promised

**Consequences:**
- Users stay on old versions (security risk)
- Fragmented ecosystem (support burden)
- Enterprise adoption stalls ("we'll wait for stability")

**Prevention:**
- **Follow semver strictly**—breaking changes = major version
- Provide automated migration (`luca upgrade` with codemods)
- Deprecation period before removal (warn for one minor version)
- Maintain upgrade guides for each version
- Test upgrades from previous versions in CI

**Detection:**
- Breaking change analysis in PRs
- Upgrade testing in release pipeline

**Confidence:** HIGH (verified via Next.js, MUI, Tailwind migration patterns)

---

### Pitfall 10: Documentation Assumes Expert Knowledge

**What goes wrong:** Documentation written by experts assumes context users don't have, creating steep learning curve.

**Symptoms:**
- "Just run X" without explaining what X does
- Acronyms and jargon without definitions
- Missing "getting started" path
- Error messages without remediation

**Consequences:**
- Users can't self-serve
- Support burden increases
- Experts can use it, beginners can't (limits adoption)

**Prevention:**
- **Write for "curious but new" user**—explain why, not just what
- Include troubleshooting for every error user might see
- Provide working examples, not just API references
- Test documentation with someone unfamiliar with the project
- Separate "quick start" from "comprehensive reference"

**Detection:**
- Support questions that documentation should answer
- Time-to-first-value metrics

**Confidence:** HIGH (general DX best practice)

---

## Minor Pitfalls

Mistakes that cause annoyance but are fixable.

### Pitfall 11: Workspace Protocol in Monorepo Publishing

**What goes wrong:** `workspace:` protocol in package.json causes publishing failures or broken packages.

**Why it happens:**
- pnpm workspaces use `workspace:*` to reference local packages
- If not properly converted to semver ranges before publish, npm installs fail
- Version mismatches between workspace packages cause `ERR_PNPM_NO_MATCHING_VERSION_INSIDE_WORKSPACE`

**Prevention:**
- Use `pnpm -r publish` for recursive publishing
- Verify `workspace:` references converted in `prepublishOnly`
- Test with `--dry-run` before actual publish
- Pin workspace dependency versions explicitly

**Confidence:** MEDIUM (verified via pnpm documentation)

---

### Pitfall 12: Agent Context Files Ignored or Misconfigured

**What goes wrong:** `.cursor/rules/`, `AGENTS.md`, or BRAIN.md files not loaded by AI, causing agents to ignore project conventions.

**Why it happens:**
- Files in wrong location
- Incorrect file format (`.mdc` vs `.md`)
- Rules too verbose (context limit exceeded)
- Cursor version doesn't support feature

**Prevention:**
- Follow Cursor's documented file locations exactly
- Test rules actually load in fresh workspace
- Keep rules concise—one concern per file
- Document minimum Cursor version requirements

**Confidence:** HIGH (verified via Cursor documentation)

---

### Pitfall 13: Cross-Platform Path Handling

**What goes wrong:** Hardcoded paths work on Mac/Linux but fail on Windows (or vice versa).

**Why it happens:**
- `/` vs `\` path separators
- Case sensitivity differences
- Home directory resolution (`~` not universal)
- Absolute paths hardcoded

**Prevention:**
- Use `path.join()` and `path.resolve()` everywhere
- Use `os.homedir()` for home directory
- Test on Windows in CI
- Never hardcode absolute paths

**Confidence:** HIGH (general cross-platform development)

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|----------------|------------|
| CLI Distribution | npm config errors, permission issues | Test on clean machines, recommend npx |
| MCP Integration | Connection fragility, version variance | Better error handling, diagnostic commands |
| Enterprise Adoption | Security perception gap | Document security posture, target AppSec |
| Team Rollout | Config drift | Version-controlled config, validation |
| Version Updates | Breaking changes | Strict semver, migration tooling |
| Branding/Templating | Path resolution failures | Use relative paths, test scenarios |

---

## Enterprise Adoption Checklist

Critical items for enterprise acceptance:

- [ ] Supply chain security documented
- [ ] SOC 2 audit trail capabilities
- [ ] No auto-running scripts (explicit user invocation)
- [ ] Clear data handling documentation (what leaves machine)
- [ ] Version pinning support
- [ ] Offline/air-gapped operation support (if possible)
- [ ] Security questionnaire template ready
- [ ] Minimum privilege principle followed

---

## Lessons from Similar Projects

### Taskmaster (Claude Task Master)

**What worked:**
- Task breakdown reduces errors by up to 90%
- Structured PRD → tasks pipeline maintains focus
- Multi-editor support (Cursor, Windsurf, Roo) increased adoption

**What to learn:**
- Integration > replacement (don't try to replace existing tools)
- Structured prompts (BRAIN.md, MEMORY.md) maintain context
- Task dependency tracking prevents agents from getting lost

### Claude Code

**What worked:**
- CLI-based approach over IDE extension (security, control)
- Dynamic codebase exploration vs static context
- `claude.md` files for context persistence

**What to learn:**
- No built-in memory is a feature (explicit context files)
- Command-line control preferred by power users
- Workspace-level configuration works better than global

### Enterprise AI Adoption Patterns

**What worked:**
- 92% achieved greater efficiency by integrating tools vs replacing
- Structured onboarding reduces time-to-first-PR from 5 days to 70 minutes

**What failed:**
- "Rip and replace" migrations: 18% over budget average
- Autocomplete-only AI tools: ~10% productivity gain, often distracting
- Consolidation without integration: 68% reduced productivity

---

## Sources

### HIGH Confidence (Official/Verified)
- Wiz Research: VSCode Marketplace Supply Chain Risk (Oct 2025)
- Koi Security: VSCode IDE Forks Recommended Extensions Vulnerability (Jan 2026)
- npm Documentation: package.json bin field, lifecycle scripts
- Cursor Documentation: Rules, MCP configuration
- Snyk: AI Adoption Security Report 2025
- NVD: CVE-2025-52882 (Claude Code websocket vulnerability)

### MEDIUM Confidence (Multiple Sources Agree)
- Atlassian: State of Developer Experience Report 2025
- CloudBees: 2025 DevOps Migration Index
- pnpm Documentation: Workspace publishing

### LOW Confidence (Needs Validation)
- Specific productivity percentages (90% error reduction claims)
- Exact enterprise migration cost figures ($1.75M average)

---

*This document informs roadmap structure by identifying where extra care, testing, and documentation are needed to avoid common failure modes in developer tool distribution.*
