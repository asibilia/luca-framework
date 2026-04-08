import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const classifyComplexityTool = createTool({
  id: 'classify-complexity',
  description: 'Classify the complexity of a development task based on scope, file count, dependency depth, and risk factors. Returns a complexity level (TRIVIAL/SIMPLE/MODERATE/COMPLEX/CRITICAL) with reasoning.',
  inputSchema: z.object({
    taskDescription: z.string().describe('Description of the development task'),
    estimatedFileCount: z.number().optional().describe('Estimated number of files affected'),
    crossCuttingConcerns: z.array(z.string()).optional().describe('List of cross-cutting concerns (e.g., auth, state management, API changes)'),
    hasBreakingChanges: z.boolean().optional().describe('Whether the change introduces breaking changes'),
    affectedDomains: z.array(z.string()).optional().describe('List of affected architectural domains'),
  }),
  outputSchema: z.object({
    complexity: z.enum(['TRIVIAL', 'SIMPLE', 'MODERATE', 'COMPLEX', 'CRITICAL']),
    reasoning: z.string(),
    factors: z.object({
      fileScope: z.enum(['small', 'medium', 'large']),
      dependencyDepth: z.enum(['shallow', 'moderate', 'deep']),
      riskLevel: z.enum(['low', 'medium', 'high']),
    }),
  }),
  execute: async (inputData) => {
    const { taskDescription, estimatedFileCount = 0, crossCuttingConcerns = [], hasBreakingChanges = false, affectedDomains = [] } = inputData;

    // Deterministic heuristic classification
    let score = 0;

    // File count factor
    if (estimatedFileCount <= 2) score += 0;
    else if (estimatedFileCount <= 5) score += 1;
    else if (estimatedFileCount <= 15) score += 2;
    else if (estimatedFileCount <= 30) score += 3;
    else score += 4;

    // Cross-cutting concerns
    score += Math.min(crossCuttingConcerns.length, 4);

    // Breaking changes
    if (hasBreakingChanges) score += 2;

    // Domain spread
    if (affectedDomains.length > 3) score += 2;
    else if (affectedDomains.length > 1) score += 1;

    // Text heuristics
    const desc = taskDescription.toLowerCase();
    if (desc.includes('refactor') || desc.includes('migration')) score += 1;
    if (desc.includes('security') || desc.includes('auth')) score += 1;
    if (desc.includes('database') || desc.includes('schema')) score += 1;

    // Map score to complexity
    const complexity = score <= 1 ? 'TRIVIAL' as const
      : score <= 3 ? 'SIMPLE' as const
      : score <= 6 ? 'MODERATE' as const
      : score <= 9 ? 'COMPLEX' as const
      : 'CRITICAL' as const;

    const fileScope = estimatedFileCount <= 3 ? 'small' as const
      : estimatedFileCount <= 15 ? 'medium' as const
      : 'large' as const;

    const dependencyDepth = crossCuttingConcerns.length <= 1 ? 'shallow' as const
      : crossCuttingConcerns.length <= 3 ? 'moderate' as const
      : 'deep' as const;

    const riskLevel = (hasBreakingChanges || score > 6) ? 'high' as const
      : score > 3 ? 'medium' as const
      : 'low' as const;

    return {
      complexity,
      reasoning: `Score ${score}: ${estimatedFileCount} files, ${crossCuttingConcerns.length} cross-cutting concerns, ${affectedDomains.length} domains${hasBreakingChanges ? ', has breaking changes' : ''}`,
      factors: { fileScope, dependencyDepth, riskLevel },
    };
  },
});
