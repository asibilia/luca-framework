# scout-research

Spawn parallel researchers to investigate ecosystem context and implementation details of article techniques.

## main

# Scout Research

Sub-skill for Step 3 of the scout per-article pipeline. Deep research into the techniques and concepts identified in the digest.

## Arguments

- slug: Article identifier
- digest_path: Path to the digest markdown file

## Process

\`\`\`bash
luca-bridge write-status --skill=scout-research --stage=RESEARCHING 2>/dev/null || true
\`\`\`

1. Read the digest to understand key concepts and techniques
2. Spawn two researchers in **parallel**:
   - **Ecosystem researcher**: Research the ecosystem around the article's techniques — related tools, frameworks, community adoption, state of the art
   - **Implementation researcher**: Research implementation details — APIs, code patterns, configuration approaches, version compatibility
3. Wait for both to complete
4. Synthesize their outputs into the digest file:
   - Append "Related Work" section (from ecosystem findings)
   - Append "Technique Deep-Dive" section (from implementation findings)

## Researcher Prompts

### Ecosystem Researcher Prompt
"Research the ecosystem around these techniques from the article at {digest_path}. Focus on: related tools and frameworks, community adoption levels, state of the art, competing approaches, and real-world usage examples. Scope your research to the specific techniques described, not the whole field."

### Implementation Researcher Prompt
"Research implementation details for the techniques described in the article at {digest_path}. Focus on: specific APIs and SDKs, code patterns, configuration requirements, version compatibility, performance characteristics, and integration patterns. Provide concrete examples."

## Output

Update the digest file in-place by populating the "Related Work" and "Technique Deep-Dive" sections. Do NOT overwrite existing sections.

## Confidence Levels

- **HIGH**: Verified with Context7 or official docs
- **MEDIUM**: Single authoritative source
- **LOW**: WebSearch only, flag for validation

\`\`\`bash
luca-bridge clear-status 2>/dev/null || true
\`\`\`