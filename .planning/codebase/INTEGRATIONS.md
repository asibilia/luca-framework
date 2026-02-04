# External Integrations

**Analysis Date:** 2026-02-04

## APIs & External Services

**Task Management:**
- Taskmaster AI - Task management and planning via MCP server
  - MCP Server: `user-taskmaster-ai`
  - Usage: Task tracking, PRD parsing, complexity analysis (`.cursor/rules/taskmaster.mdc`)
  - CLI: `task-master` command (`.cursor/rules/dev_workflow.mdc`)

**Project Management:**
- Atlassian Jira - Read-only ticket access via MCP
  - MCP Server: `user-Atlassian-MCP-Server`
  - Usage: Fetch ticket details, search tickets (`.cursor/rules/atlassian-mcp.mdc`)
  - Auth: OAuth via Cursor MCP settings
  - Policy: Read-only (no ticket creation/editing via framework)

**Version Control:**
- GitHub - Issue and PR management via CLI and MCP
  - MCP Server: `user-github-official`
  - CLI: `gh` command for issues/PRs (`.cursor/skills/git-pr/SKILL.md`, `.cursor/skills/git-feature/SKILL.md`)
  - Usage: Create issues from Jira tickets, create PRs, branch management

**Analytics:**
- PostHog - Product analytics integration
  - MCP Server: `user-posthog`
  - Usage: Feature flags, event tracking (`.cursor/rules/posthog-integration.mdc`)
  - Auth: API key from `.env` or `.cursor/mcp.json`

**Context & Research:**
- Context7 - Context management via MCP
  - MCP Server: `user-context7`
  - Usage: Context retrieval for agents

**Browser Automation:**
- Cursor IDE Browser - Web interaction and testing
  - MCP Server: `cursor-ide-browser`
  - Usage: Frontend testing, web app development (MCP server instructions)

## Data Storage

**Databases:**
- Not applicable - Framework is documentation-based
- Projects using Luca framework manage their own databases

**File Storage:**
- Local filesystem - All framework files stored in repository
- Git repository - Version control for framework and project planning artifacts

**Caching:**
- Not applicable - No caching layer in framework

## Authentication & Identity

**Auth Provider:**
- Cursor IDE - Primary authentication context
- MCP Server Authentication - Per-server OAuth/API key configuration
  - Atlassian: OAuth via Cursor settings
  - GitHub: Token-based via `gh` CLI or MCP
  - PostHog: API key via environment variables
  - Taskmaster: API keys for AI providers (Anthropic, OpenAI, etc.)

**Implementation:**
- MCP servers handle their own authentication
- API keys stored in `.cursor/mcp.json` (user-configured, not in repo)
- Environment variables for CLI tools (`.env` file)

## Monitoring & Observability

**Error Tracking:**
- Not applicable - Framework relies on Cursor IDE error handling

**Logs:**
- Cursor IDE console - Agent execution logs
- Git commits - Change tracking via commit history
- Planning artifacts - `.planning/` directory tracks project state

## CI/CD & Deployment

**Hosting:**
- GitHub - Framework repository hosted on GitHub
- Projects using Luca framework follow their own hosting

**CI Pipeline:**
- Not configured - Framework is documentation-based
- Projects using Luca framework configure their own CI/CD

## Environment Configuration

**Required env vars:**

For MCP servers (configured in `.cursor/mcp.json`):
- `ANTHROPIC_API_KEY` - For Taskmaster AI operations
- `PERPLEXITY_API_KEY` - For Taskmaster research operations
- `OPENAI_API_KEY` - Alternative AI provider for Taskmaster
- `GOOGLE_API_KEY` - Alternative AI provider for Taskmaster
- `POSTHOG_API_KEY` - PostHog analytics integration
- `GITHUB_TOKEN` - GitHub API access (if using GitHub MCP)

For CLI tools (configured in `.env`):
- `JIRA_BASE_URL` - Atlassian instance URL (`.cursor/skills/jira-issue/SKILL.md`)
- `JIRA_USER_EMAIL` - Atlassian account email
- `JIRA_API_TOKEN` - Atlassian API token
- `JIRA_TICKET_PREFIX` - Project ticket prefix (e.g., `PROJ`, `PT`)

**Secrets location:**
- `.cursor/mcp.json` - MCP server API keys (user-configured, gitignored)
- `.env` - CLI tool environment variables (gitignored)
- Cursor IDE settings - OAuth tokens for MCP servers

## Webhooks & Callbacks

**Incoming:**
- Not applicable - Framework doesn't expose webhooks

**Outgoing:**
- Not applicable - Framework doesn't make webhook calls

## MCP Server Architecture

**Available MCP Servers:**

1. **user-taskmaster-ai** - Task management and AI-powered planning
   - Tools: `get_tasks`, `add_task`, `parse_prd`, `expand_task`, `research`, etc.
   - Location: `.cursor/rules/taskmaster.mdc` documents integration

2. **user-Atlassian-MCP-Server** - Jira ticket access
   - Tools: `getJiraIssue`, `searchJiraIssuesUsingJql`, `getVisibleJiraProjects`
   - Policy: Read-only access (`.cursor/rules/atlassian-mcp.mdc`)

3. **user-github-official** - GitHub operations
   - Tools: GitHub API operations via MCP
   - Usage: Issue/PR management alongside `gh` CLI

4. **user-posthog** - Analytics integration
   - Tools: Feature flags, event tracking
   - Usage: `.cursor/rules/posthog-integration.mdc`

5. **user-context7** - Context management
   - Tools: Context retrieval and management

6. **cursor-ide-browser** - Browser automation
   - Tools: `browser_navigate`, `browser_snapshot`, `browser_click`, etc.
   - Usage: Frontend testing and web app development

**MCP Configuration:**
- Servers configured in `.cursor/mcp.json` (user-specific, not in repo)
- Each server requires appropriate API keys/tokens
- Server restart required after configuration changes (`.cursor/rules/dev_workflow.mdc`)

---

*Integration audit: 2026-02-04*
