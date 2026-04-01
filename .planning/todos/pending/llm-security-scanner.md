---
title: LLM-based security scanner for package lock updates
area: security
created: 2026-03-31
source: conversation
---

## Context

Idea for a new tool/feature: an intelligent security scanner that monitors dependency changes and uses LLM analysis to detect supply chain threats.

## Task

Build an LLM-based security scanner with the following capabilities:

- **Trigger**: Runs on package lock file updates (bun.lock, package-lock.json, etc.)
- **Analysis**: Searches the web for the updated package's source code, changelogs, and maintainer activity
- **Detection**: Flags suspicious activity (maintainer transfers, obfuscated code, unexpected network calls, typosquatting, etc.)
- **Reporting**: Creates pull requests with scan findings
- **Execution modes**:
  - GitHub Action (automated on PRs that touch lock files)
  - Manual local invocation
- **Feedback loop**: User can rate findings (true positive / false positive), scanner learns over time to improve signal-to-noise ratio
- **Memory integration**: Findings and user ratings stored in MuninnDB for cross-project learning

## Notes

- Could integrate with existing Luca hook system (e.g., post-install hook)
- Learning component aligns with Luca's MuninnDB pattern/pitfall memory model
- Consider leveraging WebSearch/WebFetch tools for source code analysis
- Rating system maps naturally to MuninnDB feedback engrams
