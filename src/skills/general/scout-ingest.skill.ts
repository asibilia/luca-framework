/**
 * scout-ingest Skill - Thin sub-skill wrapper for the article ingestion step of the scout pipeline.
 */
import { createSkill } from "~/skills/__helpers/create-skill";
import type { SkillConfig } from "~/skills/__schemas/skill.schemas";

const scoutIngestConfig: SkillConfig = {
  frontmatter: {
    name: "scout-ingest",
    description:
      "Fetch an article URL, extract content, and produce a structured digest document for the scout pipeline.",
  },
  sections: [
    {
      title: "main",
      content: `# Scout Ingest

Sub-skill for Step 1 of the scout per-article pipeline.

## Arguments

- URL: The article URL to ingest
- slug: URL-safe identifier for the article
- output_path: Where to write the digest (e.g., .planning/scouting/digests/2026-03-30-article-name.md)

## Process


1. Use WebFetch to retrieve the article content from the provided URL
2. Extract: title, author, publication date, main content body
3. Handle common formats:
   - Blog posts (extract from article/main content area)
   - Documentation pages (extract structured content)
   - Announcements (extract key points and links)
4. Write a structured digest to the output_path with these sections:
   - **Summary**: 3-5 sentences capturing the article's key points
   - **Key Concepts**: Bulleted list of main concepts introduced or discussed
   - **Techniques & Patterns**: Specific techniques, patterns, or approaches described
   - Leave "Related Work" and "Technique Deep-Dive" sections empty (filled by later stages)

## Output Validation

The digest file MUST contain:
- A title (# heading)
- Source URL and date
- Non-empty Summary section
- Non-empty Key Concepts section (at least 2 bullets)
- Non-empty Techniques & Patterns section

## Error Handling

If WebFetch fails (paywall, 404, timeout):
- Write a stub digest with status: fetch-failed
- Include the URL and error reason
- The orchestrator will route this to manual-review

`,
    },
  ],
};

export const scoutIngestSkill = createSkill(scoutIngestConfig);
