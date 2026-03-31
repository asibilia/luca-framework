# scout-relevance

Assess article relevance to the <%= branding.frameworkName %> framework and route LOW-relevance articles to manual review.

## main

# Scout Relevance Gate

Sub-skill for Step 2 of the scout per-article pipeline.

## Arguments

- slug: Article identifier
- digest_path: Path to the digest markdown file

## Process


1. Read the digest document at the provided path
2. Assess relevance to the <%= branding.frameworkName %> framework:
   - **HIGH**: Directly applicable — agentic development, LLM orchestration, developer tooling, memory systems, verification, step enforcement
   - **MEDIUM**: Potentially applicable — general LLM patterns, workflow automation, knowledge management, IDE extension patterns
   - **LOW**: Tangential — pure ML research, non-supported platforms, enterprise-only patterns, marketing content
3. Output the assessment in this exact format:

\`\`\`
RELEVANCE: HIGH|MEDIUM|LOW
RATIONALE: One paragraph explaining the score
KEY_MATCHES: [comma-separated list of matching <%= branding.frameworkName %> domains]
\`\`\`

## Routing Logic

- **HIGH or MEDIUM**: Return success — orchestrator continues the pipeline
- **LOW**: Write a manual-review document to `.planning/scouting/manual-review/{date}-{slug}.md` explaining why, then return LOW status

## Conservative Scoring

When in doubt, score MEDIUM (not LOW). LOW is a terminal state — the article exits the pipeline. Only score LOW when the article is clearly unrelated to developer tooling, agentic AI, or workflow automation.