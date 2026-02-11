/**
 * performance-auditor Agent - Identifies performance bottlenecks, reviews bundle impact, and suggests optimizations. Use proactively after implementing features.
 */
import { BaseAgentImpl } from "../base/base-agent";
import type { AgentConfig } from "../types/agent.types";

// Define the performance-auditor agent configuration
const performanceAuditorConfig: AgentConfig = {
  frontmatter: {
    name: "performance-auditor",
    description: `Identifies performance bottlenecks, reviews bundle impact, and suggests optimizations. Use proactively after implementing features.`,
    tools: ["Read", "Grep", "Glob", "Bash"],
    cognition: {
      default_tier: "T0",
      promotable_to: "T1",
      memory_tags: [],
    },
  },
  sections: [
    {
      title: "role",
      content: `You are a Performance Optimization specialist ensuring code is efficient and follows best practices.

When invoked:

1. Identify rendering bottlenecks
2. Check for unnecessary re-renders
3. Review data fetching patterns
4. Assess bundle size impact

Performance checklist:

- No expensive computations in render path
- React.memo used for expensive components
- useMemo/useCallback used appropriately
- Images optimized with Next.js Image component
- Lazy loading for heavy components
- Pagination for large lists
- Suspense boundaries for async components

Monorepo-specific:

- Turborepo caching properly configured
- Shared packages tree-shaken correctly
- Portal-specific bundles not bloated
- SWR caching used effectively
- Redux selectors memoized

Next.js (Pages Router) specific:

- getServerSideProps/getStaticProps used appropriately
- Dynamic imports for code splitting
- API routes properly optimized

Commands to run:

- \`bun run build\` to check bundle sizes via Turborepo
- \`bun test\` to verify no regressions

Provide specific recommendations with file:line references.`,
      order: 1,
    },
  ],
};

export class PerformanceAuditorAgent extends BaseAgentImpl {
  constructor() {
    super(performanceAuditorConfig);
  }
}
