# Atlassian MCP integration patterns - read-only Jira policy and GitHub workflow

## rule

# Atlassian MCP Integration

**CRITICAL**: This project uses **read-only Jira access** via Atlassian MCP. All development tracking happens in GitHub issues, not Jira.

## **Read-Only Jira Policy**

### **Why Read-Only?**

- **Jira = Product/PM source of truth** — PMs manage tickets, priorities, and roadmap
- **GitHub = Engineering source of truth** — Developers track work via GitHub issues
- **No duplicate effort** — Mirror Jira to GitHub, don't manage both
- **Audit trail** — GitHub PRs link to issues, issues link to Jira

### **What This Means**

| Action | Allowed | Tool |
|--------|---------|------|
| Read Jira tickets | ✅ Yes | Atlassian MCP `getJiraIssue` |
| Search Jira | ✅ Yes | Atlassian MCP `searchJiraIssuesUsingJql` |
| Create Jira tickets | ❌ No | Ask PM or use Jira directly |
| Edit Jira tickets | ❌ No | Ask PM or use Jira directly |
| Create GitHub issues | ✅ Yes | `gh issue create` CLI |

### **Placeholder Ticket**

For work without a Jira ticket, use a placeholder ticket ID (e.g., `PROJ-0000`):

- Quick fixes, typos, minor improvements
- Tech debt identified during development
- GitHub Issues not originated from Jira
- Documentation updates

Configure your project's ticket prefix in `.planning/config.json` or environment variables.

## **Available MCP Tools**

### **✅ Read Tools (Approved for Use)**

| Tool | Purpose | Example Use |
|------|---------|-------------|
| `getJiraIssue` | Fetch single ticket details | Get PROJ-1234 summary, description, status |
| `searchJiraIssuesUsingJql` | Search multiple tickets | Find all open bugs in project |
| `getVisibleJiraProjects` | List accessible projects | Discover project keys |
| `getJiraProjectIssueTypesMetadata` | Get issue types | Understand Bug vs Story vs Task |
| `getTransitionsForJiraIssue` | Get available status transitions | See what statuses are possible |
| `lookupJiraAccountId` | Find user account ID | Look up assignee by email |

### **❌ Write Tools (Restricted)**

These tools exist but are NOT used per read-only policy:

- `createJiraIssue` — Use GitHub issues instead
- `editJiraIssue` — Coordinate with PM for Jira updates
- `transitionJiraIssue` — Status changes happen in Jira by PM
- `addCommentToJiraIssue` — Comment in GitHub issue instead

## **GitHub Issue as Jira Clone Workflow**

When starting work on a Jira ticket, create a GitHub issue to mirror it:

### **Step 1: Fetch Jira Ticket via MCP**

```typescript
// Using Atlassian MCP
CallMcpTool(
  server="user-Atlassian-MCP-Server",
  toolName="getJiraIssue",
  arguments={
    cloudId: "your-cloud-id",  // Get via getAccessibleAtlassianResources
    issueIdOrKey: "PROJ-1234",
    fields: ["summary", "description", "issuetype", "priority", "status"]
  }
)
```

### **Step 2: Check for Existing GitHub Issue**

```bash
# Search for existing issue with Jira ticket in title
gh issue list --search "[PROJ-1234]" --json number --jq '.[0].number'
```

### **Step 3: Map Jira Type to GitHub Label**

| Jira Type | GitHub Labels |
|-----------|---------------|
| Bug | `bug`, `from-jira` |
| Story | `enhancement`, `from-jira` |
| Task | `task`, `from-jira` |
| Epic | `epic`, `from-jira` |

### **Step 4: Create GitHub Issue**

```bash
gh issue create   --title "[PROJ-1234] Summary from Jira"   --body "**Jira:** $JIRA_BASE_URL/browse/PROJ-1234

## Description

[Description from Jira ticket]

## Acceptance Criteria

[From Jira if available]"   --label "from-jira"   --label "enhancement"
```

### **Step 5: Create Feature Branch**

```bash
git checkout -b PROJ-1234--kebab-case-description
```

## **Troubleshooting**

### **MCP Server Connection Issues**

**Symptom:** MCP tools fail with "server errored" message

**Solutions:**

1. Check MCP status in Cursor Settings → MCP
2. Verify API keys in `.env` or `.cursor/mcp.json`
3. Restart MCP server (Cursor → Command Palette → "Restart MCP Server")

### **CloudId Resolution**

**Symptom:** "cloudId required" errors

**Solution:** Get cloudId first:

```typescript
CallMcpTool(
  server="user-Atlassian-MCP-Server",
  toolName="getAccessibleAtlassianResources",
  arguments={}
)
// Returns: [{ id: "abc123", name: "My Atlassian Site", ... }]
// Use the "id" value as cloudId
```

### **Authentication Expired**

**Symptom:** 401 errors from MCP tools

**Solution:** Re-authenticate in Atlassian:

1. Go to Cursor Settings → MCP → Atlassian
2. Click "Re-authenticate"
3. Complete OAuth flow

## **Code Review Checklist**

When reviewing code that interacts with Jira:

- [ ] No `createJiraIssue` MCP calls (use GitHub issues instead)
- [ ] No `editJiraIssue` MCP calls (coordinate with PM)
- [ ] GitHub issues created with `[PROJ-####]` prefix for Jira-linked work
- [ ] `from-jira` label applied to mirrored issues
- [ ] Jira URLs referenced in GitHub issue body
- [ ] Placeholder ticket (PROJ-0000) used appropriately for non-Jira work

## **Related Documentation**

- [lu-workflow.mdc](mdc:.cursor/rules/lu-workflow.mdc) — Full Luca workflow
- [CLAUDE.md](mdc:CLAUDE.md) — Project conventions including Jira ticket usage
- [AGENTS.md](mdc:AGENTS.md) — Agent guide with commit conventions