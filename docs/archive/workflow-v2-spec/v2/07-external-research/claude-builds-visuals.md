# Claude Builds Visuals

## Source

- **URL**: https://claude.com/blog/claude-builds-visuals
- **Fetched**: 2026-03-22
- **Relevance**: LOW

## Summary

This is a product announcement for Claude's inline visual generation feature -- the ability to create interactive charts, diagrams, and visualizations directly within conversations. Claude generates custom visualizations when it determines they would aid comprehension, or when explicitly requested. The feature supports iterative refinement through follow-up requests.

The post is primarily a feature announcement with minimal technical depth. It describes conversational iteration (build initial visual, accept refinement requests) and mentions integration with third-party apps like Figma, Canva, and Slack. No architecture, multi-agent patterns, memory management, or workflow engineering details are provided.

The relevance to Luca v2 is minimal -- this is a consumer product feature, not an engineering workflow pattern.

## Key Patterns Relevant to Luca v2

### Conversational Iteration Model

- **What**: Build initial artifact, then accept refinement requests as discussion deepens. The system decides when visuals would aid comprehension.
- **How it applies to v2**: The pattern of "generate artifact, then refine based on feedback" is relevant to review loops. The initial research output is the artifact; reviewer feedback drives refinement iterations.
- **Confidence**: LOW

### Proactive Artifact Generation

- **What**: Claude decides when to create visuals without being asked, based on whether they would aid understanding.
- **How it applies to v2**: Research agents could proactively generate diagrams or visualizations when analyzing complex architectures, rather than only producing text. However, this is a stretch for Luca's CLI context.
- **Confidence**: LOW

## Specific Techniques to Adopt

- **Inline refinement loop**: The pattern of "produce output -> receive feedback -> refine" is the basic review loop pattern, though this source adds no novel implementation details

## Specific Techniques to Avoid

- **Consumer-focused interaction model**: This is designed for general users in a chat UI, not for agentic development workflows
- **Visual-first output**: Luca v2 research output should be structured markdown with code references, not interactive visualizations

## Quotes / Key Excerpts

> "Claude builds them to aid users' understanding as it's discussing the topic at hand."
