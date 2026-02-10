# Research Synthesis: Luca Framework v1

**Synthesized:** 2026-02-04  
**Confidence:** HIGH (all research areas cross-validated)

---

## Executive Summary

This document synthesizes research across four critical areas—**Stack**, **Features**, **Architecture**, and **Pitfalls**—to inform the Luca Framework v1 roadmap. The research reveals a clear market opportunity: **standardized, versioned distribution of Cursor agent configurations** with enterprise-grade security and governance.

**Key Finding:** The market gap is not in AI coding assistants (85% adoption), but in **distribution and governance of agent configurations**. Current solutions are fragmented (scattered npm packages, manual copy-paste), creating an opportunity for npm-style agent distribution with semantic versioning.

**Strategic Position:** Cursor-first design with CLI-based distribution avoids supply chain risks while enabling team governance, version control, and seamless updates.

---

## Critical Insights by Research Area

### Stack Research: Technology Foundation

**Core Stack Decisions:**

- **CLI Framework:** citty (UnJS ecosystem, zero deps, TypeScript-native)
- **Prompts:** @clack/prompts (80% smaller than Inquirer, async-native)
- **Logging:** consola + picocolors (UnJS ecosystem, 14x smaller than chalk)
- **Config:** cosmiconfig + zod (industry standard, runtime validation)
- **Bundling:** unbuild (active, Rollup-based, better than deprecated tsup)
- **Package Pattern:** `create-luca` + `luca-framework` dual package

**Key Constraints:**

- Node.js 18+ requirement (native fetch, ESM)
- Avoid postinstall scripts (security risk)
- Explicit `npx luca init` pattern over auto-execution

**Confidence:** HIGH (verified against npm stats, official docs)

---

### Features Research: Market Landscape

**Market Position:**

- **Table Stakes:** Multi-model support, MCP (80%+ coverage), Git awareness, project-level config
- **Differentiators:** CLI-based agent distribution, semantic versioning, composable agents, Cursor-first design
- **Anti-Features:** Don't build IDE, don't train models, don't replace MCP, don't go IDE-agnostic day 1

**Competitive Gap:**

- No standardized distribution for Cursor agent configs
- Fragmented solutions: `@mrzacsmith/cursor-rules`, `cursor-rules-downloader`, CursorRules.org
- Opportunity: npm-style `bun add @luca/agent-security-reviewer` pattern

**Enterprise Requirements:**

- SSO/SAML (standard in enterprise tiers)
- SOC 2 Type II (79% of tools lack public attestation)
- No training on customer code (legal/IP requirement)
- BYOK (data control requirement)

**Confidence:** HIGH (multiple authoritative sources cross-referenced)

---

### Architecture Research: System Design

**Core Patterns:**

1. **Luca/User Separation:** `.cursor/luca/` (framework, updatable) vs `.cursor/agents/` (user, preserved)
2. **Adapter-Based Integrations:** Interface contracts for work tracking (Jira, Linear, GitHub Issues)
3. **Convention Over Configuration:** Sensible defaults with explicit override paths
4. **Layered Configuration:** Global → project → local with clear precedence
5. **Manifest-Driven Updates:** Hash-based conflict detection for intelligent merges
6. **Hook-Based Extensibility:** Lifecycle events for customization

**File Structure:**

```
.cursor/
├── luca/          # Framework (updatable)
├── agents/          # User (customizable)
├── skills/          # User (customizable)
└── config.json      # User configuration

.planning/
├── config.json      # Project configuration
├── integrations/    # Adapter implementations
└── [state files]
```

**Update Strategy:**

- Manifest tracks file hashes + versions
- Compare current vs new manifest
- Update unchanged files automatically
- Flag conflicts for user-modified files
- Never overwrite user customizations

**Confidence:** HIGH (patterns validated via VS Code, Rails, cosmiconfig)

---

### Pitfalls Research: Risk Mitigation

**Critical Risks (Must Address):**

1. **IDE Extension Supply Chain Vulnerabilities**
   - **Risk:** Malicious extensions via compromised PATs (150K+ installs affected)
   - **Mitigation:** CLI-based distribution (already planned) ✅
   - **Action:** Document supply chain security posture

2. **npm Lifecycle Script Attack Surface**
   - **Risk:** `postinstall` scripts execute with user privileges
   - **Mitigation:** Explicit `npx luca init` pattern, avoid postinstall ✅
   - **Action:** Never auto-execute, always require user invocation

3. **Enterprise Security Perception Gap**
   - **Risk:** Leadership approves, AppSec blocks (29.8% vs 2x rejection rate)
   - **Mitigation:** Target security practitioners, document audit trail capabilities
   - **Action:** Create security questionnaire template, SOC 2 documentation

4. **MCP Server Connection Fragility**
   - **Risk:** Silent failures, cryptic errors ("Client Closed")
   - **Mitigation:** Better error handling, diagnostic commands (`luca doctor`)
   - **Action:** Wrap MCP calls, document minimum requirements (Node.js 20+)

**Moderate Risks:**

1. **Time-to-First-Value Exceeds Tolerance**
   - **Benchmark:** ~1 day 12 hours expected, 70-minute achievable
   - **Goal:** Working in 5 minutes (from PROJECT.md)
   - **Action:** Zero-config default path, delay optional config until after first success

2. **Breaking Changes Without Migration Path**
   - **Risk:** Users freeze versions, fragmented ecosystem
   - **Mitigation:** Strict semver, automated migration (`luca upgrade` with codemods)
   - **Action:** Test upgrades from previous versions in CI

**Confidence:** HIGH (verified via Wiz Research, Snyk reports, npm security advisories)

---

## Prioritized v1 Roadmap Recommendations

### Phase 1: Foundation (MVP - Weeks 1-4)

**Must Have (Table Stakes):**

1. ✅ **CLI Installation** - `npx create-luca` with zero-config default
2. ✅ **Luca/User Separation** - Framework files vs user customizations
3. ✅ **Basic Agent Library** - 5-10 pre-built agents (planner, executor, verifier, etc.)
4. ✅ **Cursor Integration** - Work with existing `.cursor/rules` structure
5. ✅ **MCP Compatibility** - Don't reinvent, extend existing MCP patterns
6. ✅ **Configuration System** - Layered config (global → project → local)
7. ✅ **Manifest System** - Track framework files for updates

**Success Criteria:**

- `npx create-luca` produces working state in <5 minutes
- First command (`/lu-help`) works immediately
- Framework files updatable without breaking user customizations

---

### Phase 2: Distribution & Updates (Weeks 5-8)

**Must Have:**

1. ✅ **Agent Versioning** - Semantic versions, changelog
2. ✅ **Update Mechanism** - `npx luca update` with conflict detection
3. ✅ **Diagnostic Tooling** - `luca doctor` for MCP/configuration issues
4. ✅ **Adapter System** - Interface contracts for work tracking (Jira, GitHub Issues)
5. ✅ **Hook System** - Lifecycle events for extensibility

**Success Criteria:**

- Users can update framework without losing customizations
- Conflicts detected and reported clearly
- MCP issues diagnosed automatically

---

### Phase 3: Enterprise Readiness (Weeks 9-12)

**Must Have:**

1. ✅ **Security Documentation** - Supply chain posture, audit trail capabilities
2. ✅ **Migration Tooling** - Automated upgrades with codemods
3. ✅ **Config Validation** - `luca config validate` for team consistency
4. ✅ **Error Handling** - Graceful degradation for MCP failures
5. ✅ **Documentation** - Security questionnaire template, SOC 2 guidance

**Defer to Post-MVP:**

- SSO/SAML integration (wait for demand)
- Cloud sync/team features (start with git-based sharing)
- Multi-IDE support (focus on Cursor first)
- Custom model training (use existing LLM APIs)

**Success Criteria:**

- Enterprise security teams can evaluate Luca independently
- Upgrades don't break existing installations
- Team config drift prevented

---

## Decisions Requiring User Input

### 1. Package Naming Strategy

**Options:**

- **Option A:** `create-luca` + `luca-framework` (dual package, follows ecosystem conventions)
- **Option B:** Single `luca` package (simpler, but less flexible)

**Recommendation:** Option A (dual package)

- Follows `create-vite`, `create-next-app` patterns
- Allows standalone CLI without scaffolding
- Better separation of concerns

**Decision Needed:** Confirm package naming approach

---

### 2. Agent Distribution Model

**Options:**

- **Option A:** Scoped packages (`@luca/agent-planner`, `@luca/agent-executor`)
- **Option B:** Monorepo with agent registry (`luca add agent-planner`)
- **Option C:** Git-based distribution (clone repos, symlink)

**Recommendation:** Option A (scoped packages)

- npm ecosystem integration
- Semantic versioning per agent
- Team can pin specific agent versions

**Decision Needed:** Confirm agent distribution approach

---

### 3. Configuration Format

**Options:**

- **Option A:** JSON only (static config)
- **Option B:** JSON + TypeScript (dynamic/validated config)
- **Option C:** YAML (human-readable, but less tooling)

**Recommendation:** Option B (JSON + TypeScript)

- JSON for static config (`.planning/config.json`)
- TypeScript for dynamic adapters (`.planning/integrations/*.ts`)
- Best of both worlds

**Decision Needed:** Confirm config format preference

---

### 4. Update Strategy Granularity

**Options:**

- **Option A:** Framework-level updates only (`npx luca update`)
- **Option B:** Agent-level updates (`luca update agent-planner`)
- **Option C:** Both (framework + individual agents)

**Recommendation:** Option C (both)

- Framework updates for core functionality
- Agent updates for individual improvements
- Users can update what they need

**Decision Needed:** Confirm update granularity

---

### 5. Enterprise Features Timeline

**Options:**

- **Option A:** Build enterprise features in v1 (SSO, audit logging)
- **Option B:** Defer to v2, focus on core functionality first
- **Option C:** Document enterprise requirements, build on demand

**Recommendation:** Option C (document first, build on demand)

- Focus on core functionality for v1
- Document enterprise requirements clearly
- Build features when enterprise customers commit

**Decision Needed:** Confirm enterprise feature approach

---

## Risk Mitigation Checklist

### Security (Critical)

- [ ] **Supply Chain Security**
  - CLI-based distribution (not IDE extension) ✅
  - No postinstall scripts ✅
  - Provenance verification (SLSA, Sigstore) - **TODO**
  - Dependency audit before release - **TODO**

- [ ] **Enterprise Security**
  - Security questionnaire template - **TODO**
  - Audit trail documentation - **TODO**
  - Data handling documentation (what leaves machine) - **TODO**
  - SOC 2 guidance (if pursuing certification) - **TODO**

### Reliability (High Priority)

- [ ] **MCP Fragility**
  - Better error handling wrapper - **TODO**
  - `luca doctor` diagnostic command - **TODO**
  - Minimum requirements documentation (Node.js 20+) - **TODO**
  - Graceful degradation for non-critical MCP features - **TODO**

- [ ] **Update Reliability**
  - Manifest-based conflict detection ✅
  - Automated migration tooling - **TODO**
  - Upgrade testing in CI - **TODO**
  - Rollback capability - **TODO**

### User Experience (High Priority)

- [ ] **Time-to-First-Value**
  - Zero-config default path ✅
  - Prerequisites check upfront - **TODO**
  - Immediate next action after init - **TODO**
  - "Working in 5 minutes" goal - **TODO**

- [ ] **Documentation**
  - Security questionnaire template - **TODO**
  - Troubleshooting for every error - **TODO**
  - Working examples, not just API references - **TODO**
  - Separate quick start from comprehensive reference - **TODO**

---

## Architecture Decisions Summary

| Decision | Recommendation | Rationale |
|----------|---------------|-----------|
| **CLI Framework** | citty | Zero deps, UnJS ecosystem, TypeScript-native |
| **Prompts** | @clack/prompts | 80% smaller, async-native, beautiful UI |
| **Config System** | cosmiconfig + zod | Industry standard, runtime validation |
| **Bundling** | unbuild | Active development, better than deprecated tsup |
| **File Structure** | Luca/User separation | Enables updates without breaking customizations |
| **Update Strategy** | Manifest-driven | Hash-based conflict detection |
| **Integration Pattern** | Adapter-based | Swappable implementations, interface contracts |
| **Distribution** | npm packages | Standardized, versioned, composable |

---

## Success Metrics

### v1 Launch Criteria

**Technical:**

- ✅ `npx create-luca` works in <5 minutes
- ✅ Framework updates don't break user customizations
- ✅ MCP issues diagnosed automatically
- ✅ Zero-config default produces working state

**Market:**

- ✅ 10+ pre-built agents available
- ✅ Documentation enables self-service adoption
- ✅ Security posture documented for enterprise evaluation

**User Experience:**

- ✅ First command works immediately after init
- ✅ Error messages include remediation steps
- ✅ Upgrade path clear and automated

---

## Next Steps

1. **Review Decisions** - Confirm package naming, distribution model, config format
2. **Create Roadmap** - Break down phases into specific tasks
3. **Set Up Project Structure** - Initialize with recommended architecture
4. **Build MVP** - Focus on Phase 1 foundation (Weeks 1-4)
5. **Test Early** - Validate "working in 5 minutes" goal with real users

---

## Sources

### Stack Research

- npm documentation, UnJS ecosystem, citty, cosmiconfig

### Features Research

- Cursor docs, Continue.dev, Claude Code, VS Code Custom Agents, GitHub Copilot Enterprise

### Architecture Research

- VS Code extension architecture, Rails conventions, cosmiconfig patterns, oclif hooks

### Pitfalls Research

- Wiz Research (VSCode Marketplace Supply Chain Risk), Snyk AI Adoption Security Report, npm security advisories

---

*This synthesis informs the v1 roadmap by combining technical feasibility (Stack), market opportunity (Features), system design (Architecture), and risk mitigation (Pitfalls) into actionable recommendations.*
