# Technology Stack

**Analysis Date:** 2026-02-04

## Languages

**Primary:**
- Markdown - Documentation, agent definitions, workflow templates, rules, and skills
- JSON - Configuration files (`.cursor/origin/templates/config.json`, planning configs)

**Secondary:**
- Shell/Bash - Script snippets embedded in workflow documentation
- TypeScript/JavaScript - Referenced in coding standards and examples (not directly in framework codebase)

## Runtime

**Environment:**
- Cursor IDE - Primary execution environment for agent framework
- Node.js/Bun - Referenced in rules for projects using this framework (`.cursor/rules/bun-preference.mdc`)

**Package Manager:**
- Not applicable - Framework itself has no package.json
- Projects using Luca framework may use Bun (preferred) or npm/yarn

## Frameworks

**Core:**
- Cursor Agent Framework - Custom agent system built on Cursor IDE's agent capabilities
- Model Context Protocol (MCP) - Integration layer for external tools and services

**Testing:**
- Not applicable - Framework is documentation/configuration-based

**Build/Dev:**
- Git - Version control (framework tracked in git repository)
- Markdown processors - Documentation rendering

## Key Dependencies

**Critical:**
- Cursor IDE - Required runtime environment
- MCP Servers - External integrations (Taskmaster, Atlassian, GitHub, PostHog, Context7, Browser)

**Infrastructure:**
- GitHub CLI (`gh`) - Used for issue/PR management (`.cursor/skills/git-pr/SKILL.md`, `.cursor/skills/git-feature/SKILL.md`)
- Taskmaster CLI (`task-master`) - Task management integration (`.cursor/rules/taskmaster.mdc`)
- Atlassian/Jira API - Read-only ticket access via MCP (`.cursor/rules/atlassian-mcp.mdc`)

## Configuration

**Environment:**
- Configuration via JSON files in `.cursor/origin/templates/config.json`
- Project-specific configs in `.planning/config.json`
- MCP server configuration in `.cursor/mcp.json` (not in repo, user-configured)

**Build:**
- No build process - Framework is documentation/configuration-based
- Templates and workflows are markdown files consumed directly by Cursor agents

## Platform Requirements

**Development:**
- Cursor IDE (required)
- Git (for version control)
- Access to MCP servers (Taskmaster, Atlassian, GitHub, PostHog, Context7, Browser)
- GitHub CLI (`gh`) - For issue/PR workflows
- Taskmaster CLI (`task-master`) - Optional, for task management workflows

**Production:**
- Framework is consumed by projects, not deployed itself
- Projects using Luca framework follow their own deployment requirements

---

*Stack analysis: 2026-02-04*
