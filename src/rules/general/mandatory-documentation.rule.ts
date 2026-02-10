/**
 * Mandatory documentation requirements for all new functionality and modifications
 */
import { BaseRuleImpl } from '../base/base-rule';
import type { RuleConfig } from '../types/rule.types';

// Define the Mandatory-documentat rule configuration
const MandatorydocumentatConfig: RuleConfig = {
  frontmatter: {
    description: `Mandatory documentation requirements for all new functionality and modifications`,
    globs: [''**/*.{ts,tsx,js,jsx}''],
    alwaysApply: true,
  },
  sections: [
    {
      title: 'rule',
      content: `- **Documentation is Mandatory**: ALL new functionality, utilities, and significant modifications MUST include comprehensive documentation

- **New Function/Class Requirements**:

  - **JSDoc Comments**: Complete parameter descriptions, return types, usage examples
  - **Markdown Documentation**: Create \`.docs.md\` file for significant utilities/packages
  - **Integration Examples**: Show how the functionality integrates with existing systems
  - **Error Handling**: Document error scenarios and fallback behaviors

- **Modification Requirements**:

  - **Update Existing Documentation**: When modifying functions, update corresponding docs
  - **Version Documentation**: Note breaking changes and migration paths
  - **Cross-references**: Update links between related documentation files

- **Documentation Standards**:

  \`\`\`\`typescript
  /**
   * Brief description of what the function does.
   *
   * Longer description explaining the purpose, use cases, and any important
   * implementation details. Include information about performance, error
   * handling, and integration patterns.
   *
   * @param config - Description of the parameter including type info and constraints
   * @param options - Optional parameter with default value explanation
   * @returns Description of return value and its structure
   *
   * @example
   * \`\`\`typescript
   * const result = myFunction({
   *     required: 'value',
   *     optional: 'override'
   * })
   * // Expected output: { success: true, data: 'processed' }
   * \`\`\`
   *
   * @example
   * \`\`\`typescript
   * // Error handling example
   * try {
   *     const result = myFunction(invalidConfig)
   * } catch (error) {
   *     console.error('Function failed:', error.message)
   * }
   * \`\`\`
   */
  \`\`\`\`

- **Markdown Documentation Structure**:

  \`\`\`\`markdown
  # Component/Utility Name

  Brief description and purpose.

  ## Overview

  Detailed explanation of functionality and use cases.

  ## Key Features

  - **🔧 Feature 1**: Description
  - **📋 Feature 2**: Description

  ## Usage

  ### Basic Usage

  \`\`\`typescript
  // Simple example
  \`\`\`
  \`\`\`\`

  ### Advanced Usage

  \`\`\`typescript
  // Complex example with options
  \`\`\`

  ## API Reference

  ### Functions

  #### \`functionName(param1, param2)\`

  Description, parameters, return value.

  ## Error Handling

  How errors are handled and what fallbacks exist.

  ## Performance Considerations

  Any performance implications or optimizations.

  ## Testing

  Testing strategy and coverage information.

  ## Related Documentation

  Links to related docs, dependencies, and examples.

  \`\`\`

  \`\`\`

- **Documentation Location**:

  - **Function-level**: JSDoc comments in the source file
  - **Package-level**: Create \`{package-name}.docs.md\` alongside main files
  - **Utility-level**: Create \`{utility-name}.docs.md\` in the same directory
  - **Integration examples**: Update documentation site with interactive examples when applicable

- **Documentation Site Integration** (if applicable):

  - **Interactive Examples**: Add playground/demo for user-facing functionality
  - **Live Documentation**: Update existing documentation components
  - **Route Registration**: Add new routes for major functionality demonstrations
  - **Visual Examples**: Include screenshots or interactive elements where helpful

- **Documentation Reviews**:

  - **Code Reviews Must Check**: Documentation completeness and accuracy
  - **Link Validation**: Ensure all cross-references work correctly
  - **Example Verification**: Validate that code examples actually work
  - **Update Dependencies**: Check if related documentation needs updates

- **Documentation Maintenance**:

  - **Quarterly Reviews**: Check for outdated documentation
  - **Deprecation Notices**: Document deprecated functionality with migration paths
  - **Version Updates**: Keep documentation in sync with implementation changes
  - **Dead Link Cleanup**: Remove or update broken cross-references

- **Quality Standards**:

  - **Clarity**: Documentation should be understandable by team members
  - **Completeness**: Cover all public APIs and common use cases
  - **Accuracy**: Code examples must work as written
  - **Consistency**: Follow established documentation patterns in the codebase

- **Enforcement**:
  - **PR Requirements**: PRs without adequate documentation will be rejected
  - **Documentation Debt**: Track and prioritize missing documentation
  - **Team Knowledge**: Documentation is essential for knowledge transfer
  - **Future Maintenance**: Well-documented code is easier to maintain and extend

Follow [file-naming.mdc](mdc:.cursor/rules/file-naming.mdc) for file naming conventions.`,
      order: 1
    }
  ]
};

export class MandatorydocumentatRule extends BaseRuleImpl {
  constructor() {
    super(MandatorydocumentatConfig);
  }
}
