/**
 * Prohibit class usage in favor of functional programming patterns
 */
import { BaseRuleImpl } from '../base/base-rule';
import type { RuleConfig } from '../types/rule.types';

// Define the Prohibit-class-usage rule configuration
const ProhibitclassusageConfig: RuleConfig = {
  frontmatter: {
    description: `Prohibit class usage in favor of functional programming patterns`,
    globs: ['packages-ui/**/*.ts', 'packages-ui/**/*.tsx'],
    alwaysApply: true,
  },
  sections: [
    {
      title: 'rule',
      content: `# No Classes Rule

This codebase exclusively uses **functional programming patterns**. Classes are prohibited in favor of modern functional approaches.

## **Codebase Evidence**

- **700+ functional exports** vs **0 active class instances**
- All existing patterns use functional composition, factory functions, and React hooks
- Recent class-based code has been successfully refactored to functional patterns

## **Use Instead of Classes**

### **✅ DO: Factory Functions**

\`\`\`typescript
// Factory function pattern
function createUserManager(config: Config) {
  const state = { users: [] }

  return {
    addUser: (user: User) => {
      state.users.push(user)
    },
    getUsers: () => [...state.users],
    clearUsers: () => {
      state.users.length = 0
    },
  }
}

// Usage
const userManager = createUserManager(config)
userManager.addUser(newUser)
\`\`\`

### **✅ DO: Functional Composition**

\`\`\`typescript
// Composable functions
const processTemplate = (template: string, context: object) => {
  // Implementation
}

const validateTemplate = (template: string) => {
  // Implementation
}

const createTemplateProcessor = (options: Options) => ({
  process: (template: string, context: object) =>
    processTemplate(template, context),
  validate: validateTemplate,
})
\`\`\`

### **✅ DO: React Hooks for State**

\`\`\`typescript
function useTemplateProcessor() {
  const [cache, setCache] = useState(new Map())

  const processTemplate = useCallback(
    (template: string, context: object) => {
      // Implementation with cache
    },
    [cache]
  )

  const clearCache = useCallback(() => {
    setCache(new Map())
  }, [])

  return { processTemplate, clearCache }
}
\`\`\`

### **✅ DO: Closures for Encapsulation**

\`\`\`typescript
function createTemplateCache() {
  const cache = new Map()

  return {
    get: (key: string) => cache.get(key),
    set: (key: string, value: any) => cache.set(key, value),
    clear: () => cache.clear(),
    has: (key: string) => cache.has(key),
  }
}
\`\`\`

## **❌ DON'T: Classes**

\`\`\`typescript
// ❌ DON'T: Class-based patterns
class TemplateProcessor {
  private cache = new Map()

  constructor(private options: Options) {}

  process(template: string, context: object) {
    // Implementation
  }

  clearCache() {
    this.cache.clear()
  }
}

// ❌ DON'T: Class inheritance
class ExtendedTemplateProcessor extends TemplateProcessor {
  // More complexity
}
\`\`\`

## **Migration Patterns**

### **Class → Factory Function**

\`\`\`typescript
// Before: Class
class Service {
  constructor(private config: Config) {}
  method() {
    /* implementation */
  }
}

// After: Factory function
function createService(config: Config) {
  return {
    method() {
      /* implementation */
    },
  }
}
\`\`\`

### **Class Instance → Direct Function**

\`\`\`typescript
// Before: Class instance
const processor = new TemplateProcessor()
processor.process(template, context)

// After: Direct function
import { processTemplate } from './template-processor'
processTemplate(template, context)
\`\`\`

## **Benefits of This Approach**

- **🔄 Immutability**: Easier to reason about data flow
- **🧪 Testability**: Pure functions are easier to test
- **📦 Tree Shaking**: Better bundling and dead code elimination
- **🎯 Composition**: More flexible than inheritance
- **🔍 Debugging**: Clearer stack traces and data flow

## **Exception Policy**

- **No exceptions** - use functional patterns for all new code
- **Legacy code**: Refactor classes to functional patterns when touched
- **Third-party libraries**: May use classes internally, but wrap in functional APIs

## **Enforcement**

This rule is enforced through:

- Code reviews
- Linting rules (if available)
- Architecture decision records
- Team consensus and standards

Follow [percent-ui.mdc](mdc:.cursor/rules/percent-ui.mdc) for general coding standards and [dev_workflow.mdc](mdc:.cursor/rules/taskmaster/dev_workflow.mdc) for development workflow integration.`,
      order: 1
    }
  ]
};

export class ProhibitclassusageRule extends BaseRuleImpl {
  constructor() {
    super(ProhibitclassusageConfig);
  }
}
