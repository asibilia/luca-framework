# Claude Code Review: Multi-Agent Bug Detection

## Source
- **URL**: https://claude.com/blog/code-review
- **Fetched**: 2026-03-22
- **Relevance**: HIGH

## Summary

Claude Code's review system dispatches a team of agents on every pull request to identify bugs that human reviewers often miss. The system prioritizes thorough analysis over speed -- it is the same system Anthropic runs on nearly every internal PR. The process follows four stages: parallel bug detection (multiple agents examine code simultaneously), verification phase (agents validate findings to eliminate false positives), severity ranking, and structured output delivery.

The accuracy metrics are striking: less than 1% of findings are marked incorrect by engineers, 54% of PRs now receive substantive review comments (up from 16% previously), and large PRs (1,000+ lines) have an 84% finding rate averaging 7.5 issues per review. The system scales analysis depth with PR complexity -- large changes get more agents and deeper analysis.

Two case studies demonstrate the system's ability to catch subtle bugs: a one-line authentication change that would break service auth (the kind of diff that normally gets quick approval), and a ZFS encryption refactor where it found a pre-existing type mismatch in adjacent code that would silently wipe encryption keys. These illustrate looking beyond immediate changes to identify issues in related code.

## Key Patterns Relevant to Luca v2

### Multi-Agent Parallel Review with Verification Filtering
- **What**: Multiple agents examine code simultaneously for different types of issues. A separate verification phase validates findings before surfacing them, eliminating false positives.
- **How it applies to v2**: Luca v2's review loops should use this exact pattern -- spawn parallel reviewers (Luca already has 5+ reviewer agents), then add a verification/consensus step that filters findings before presenting to the user or feeding back to the executor. The key innovation is the verification layer.
- **Confidence**: HIGH

### Scaling Depth with Complexity
- **What**: Large changes (1,000+ lines) receive deeper analysis with more agents; trivial modifications get lightweight passes.
- **How it applies to v2**: Review loop depth should be gated by complexity level. TRIVIAL/SIMPLE tasks get 1 review pass; COMPLEX/CRITICAL get multi-pass parallel review with verification. This aligns with Luca's existing complexity gating system.
- **Confidence**: HIGH

### Contextual Awareness Beyond Changed Lines
- **What**: The system examines changed code AND adjacent affected systems, identifying latent issues in code the PR touches but does not directly modify.
- **How it applies to v2**: Research agents should investigate not just the target files but related systems -- imports, callers, dependents. Review agents should check whether changes break assumptions in adjacent code.
- **Confidence**: HIGH

### Bidirectional Feedback Loops
- **What**: Automated agents surface findings; engineers validate and correct assessments; corrections feed back into system calibration. The <1% incorrect rate indicates strong calibration.
- **How it applies to v2**: MuninnDB should store review outcomes -- when a reviewer's finding is accepted vs. rejected. Over time, this calibrates which types of findings are high-value, enabling smarter review focus.
- **Confidence**: MEDIUM

### Cost Transparency with Organizational Controls
- **What**: Reviews average $15-25 per PR. Organizations get monthly spend caps, repository-level enablement, and analytics dashboards.
- **How it applies to v2**: Luca v2 should track review loop costs separately from execution costs. Budget pressure should be able to reduce review depth (fewer agents, fewer iterations) without eliminating review entirely.
- **Confidence**: MEDIUM

## Specific Techniques to Adopt

- **Verification phase as false-positive filter**: After parallel reviewers produce findings, run a separate verification pass that challenges each finding before surfacing it. This is the key to maintaining trust -- noise erodes confidence
- **Severity ranking in output**: Present review findings ordered by severity, not by reviewer or by code location. Critical bugs first
- **Adjacent code analysis**: Don't limit review to changed files. Check imports, callers, and related modules for broken assumptions
- **Overview comment + inline feedback**: Provide both a summary (big picture) and inline details (specific locations). This maps to Luca's result aggregation step
- **Scale agents with PR size**: More agents for larger changes, fewer for small ones. Token-efficient

## Specific Techniques to Avoid

- **No auto-approval**: The system explicitly does not approve PRs -- humans retain final decision authority. Luca v2 review loops should surface findings and recommendations, never auto-merge
- **Expensive-by-design reviews**: $15-25 per PR is acceptable for a SaaS product but would be excessive for Luca's per-phase reviews. Keep review loops token-efficient by using fast models for initial screening and capable models only for verification
- **20-minute review duration**: This is too slow for per-task review in an agentic workflow. Target sub-5-minute review loops by constraining scope

## Quotes / Key Excerpts

> "Code output per Anthropic engineer has grown 200% in the last year. Code review has become a bottleneck."

> "It won't approve PRs -- that's still a human call -- but it closes the gap so reviewers can actually cover what's shipping."

> "The change would have broken authentication for the service, a failure mode that's easy to read past in the diff but obvious once pointed out."

> "Less than 1% of findings marked incorrect by engineers."
