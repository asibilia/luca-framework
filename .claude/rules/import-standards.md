---
description: Standards for import statements and module organization
globs:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
alwaysApply: true
---

# Standards for import statements and module organization

## rule

# Import Standards Rule

This rule ensures consistent and clean import statements throughout the codebase.

## **Import Location Requirements**

- **All imports MUST be at the top of the file** before any other code
- **Never use inline `import()` statements** within type definitions or variable declarations
- **Group imports logically** with empty lines between groups

## **Import Grouping Order**

1. **External libraries** (node_modules packages)
2. **Internal packages** (@internal/*, @app/*, workspace aliases)
3. **Relative imports** (./file, ../file)
4. **Type-only imports** (when not mixed with value imports)

```typescript
// ✅ DO: Proper import grouping
import React from 'react'
import { createSlice } from '@reduxjs/toolkit'
import get from 'lodash/get'

import { SomeUtility } from '@internal/helpers/utility'
import { GlobalState } from '@app/state'

import { LocalHelper } from './helpers/local-helper'
import { RelativeComponent } from '../components/relative'

import type { ExternalType } from 'external-library'
import type { InternalType } from '@internal/types'
```

## **Inline Import Prohibition**

### **❌ DON'T: Inline imports in types**

```typescript
// ❌ NEVER do this
type BadState = {
  dependency_maps: Record<
    string,
    Map<string, import('../../long/path/types').SomeType>
  >
}

// ❌ NEVER do this in variable declarations
const badValue: import('./types').MyType = {}
```

### **✅ DO: Import at top of file**

```typescript
// ✅ ALWAYS do this
import type { SomeType } from '../../long/path/types'

type GoodState = {
  dependency_maps: Record<string, Map<string, SomeType>>
}
```

## **Type Import Standards**

- **Use `import type`** for type-only imports when possible
- **Separate type imports** from value imports when they come from different modules
- **Group related types** from the same module in a single import

```typescript
// ✅ DO: Clean type imports
import type { ComponentProps } from 'react'
import type { Schema, TreeNode } from './forms'
import type { FieldDependencyMap } from '../../state/types'

// ❌ DON'T: Mixed imports when types come from different sources
import { Schema, type FieldDependencyMap } from './mixed-module'
```

## **Path Resolution**

- **Use absolute imports** for all cross-package imports (workspace aliases like @internal/*, @app/*)
- **Use relative imports** only for files within the same package/directory
- **Never use complex relative paths** that traverse multiple directory levels

```typescript
// ✅ DO: Absolute imports for cross-package references
import { Helper } from '@internal/helpers/helper'
import { TemplateHelper } from '@internal/templates'
import { LocalUtil } from './utils/local-util'

// ❌ DON'T: Relative paths for cross-package imports
import { Helper } from '../../../../packages/helpers/helper'
import { TemplateHelper } from '../../../packages/templates'

// ❌ DON'T: Overly complex relative paths
import { DeepHelper } from '../../../../../../../deep/helper'
```

### **When to Use Each Import Type**

**Absolute Imports (workspace aliases):**

- Cross-package imports (importing from shared packages into apps)
- Components from different packages
- Utilities and helpers from shared packages
- Any import that would require 3+ levels of `../`

**Relative Imports:**

- Files within the same directory (`./file`)
- Files within the same package structure (`../components/`)
- Local utilities and helpers within the same package

## **Common Violations**

### **1. Inline Type Imports**

- **Problem**: `import('path').Type` within type definitions
- **Solution**: Move import to top of file

### **2. Mixed Import Groups**

- **Problem**: External and internal imports mixed together
- **Solution**: Separate with empty lines

### **3. Duplicate Imports**

- **Problem**: Same module imported multiple times
- **Solution**: Combine into single import statement

## **Linting Integration**

This rule works with ESLint import rules:

- `import/order` - Enforces import grouping
- `import/newline-after-import` - Ensures spacing
- `import/no-duplicate-imports` - Prevents duplicates

## **Migration Guidelines**

When fixing existing code:

1. **Identify inline imports** using search patterns like `import(`
2. **Extract to top-level imports** with proper grouping
3. **Update type references** to use imported types
4. **Run linter** to ensure compliance
5. **Test functionality** to ensure imports work correctly

## **Examples of Refactoring**

### **Before (Bad)**

```typescript
// Mixed imports and inline types
import React from 'react'
import type { Schema } from './forms'
import { utilityFunction } from '@packages-ui/utils'

type State = {
  maps: Record<string, import('./other').OtherType>
}
```

### **After (Good)**

```typescript
// Clean, organized imports
import React from 'react'

import { utilityFunction } from '@internal/utils'

import type { Schema } from './forms'
import type { OtherType } from './other'

type State = {
  maps: Record<string, OtherType>
}
```

## **Enforcement**

- **Code Reviews**: Must check for proper import structure
- **Linting**: ESLint rules enforce basic import standards
- **Pre-commit Hooks**: Reject commits with inline imports
- **Documentation**: All new code must follow these patterns

## **Benefits**

- **Readability**: Clear dependency visualization at file top
- **Maintainability**: Easier to refactor and update imports
- **Performance**: Better tree-shaking and bundling
- **Consistency**: Uniform code structure across project
- **Tool Support**: Better IDE and linter integration

Follow [file-naming.mdc](mdc:.cursor/rules/file-naming.mdc) for file naming conventions.