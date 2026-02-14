/**
 * Generic rule description
 */
import { BaseRuleImpl } from "../base/base-rule";
import type { RuleConfig } from "../types/rule.types";

// Define the lodash-preference rule configuration
const lodashPreferenceConfig: RuleConfig = {
  frontmatter: {
    description: `Generic rule description`,
  },
  sections: [
    {
      title: "rule",
      content: `# Lodash Function Preference Rule

This rule enforces the use of lodash functions over built-in JavaScript functions to ensure consistency, immutability, and safer operations across the codebase.

## **Core Principles**

- **Consistency**: Use lodash functions consistently across the codebase
- **Immutability**: Lodash functions provide safer immutable operations
- **Safety**: Better handling of edge cases and null/undefined values
- **Readability**: More explicit and descriptive function names

## **Import Pattern**

- **Use individual imports** for better tree-shaking and clarity
- **Follow existing pattern** in the codebase

\`\`\`typescript
// ✅ DO: Individual imports
import get from 'lodash/get'
import orderBy from 'lodash/orderBy'
import cloneDeep from 'lodash/cloneDeep'
import isEmpty from 'lodash/isEmpty'

// ❌ DON'T: Default import or namespace import
import _ from 'lodash'
import * as _ from 'lodash'
\`\`\`

## **Sorting & Ordering**

- **Use \`orderBy\` or \`sortBy\`** instead of built-in \`Array.sort()\`
- **More explicit and safer** than custom comparator functions

\`\`\`typescript
// ✅ DO: Use lodash orderBy
import orderBy from 'lodash/orderBy'

const sortedDescending = orderBy(numbers, (x) => x, 'desc')
const sortedByProperty = orderBy(objects, 'createdAt', 'desc')
const multiSort = orderBy(data, ['priority', 'date'], ['desc', 'asc'])

// ❌ DON'T: Use built-in sort
const sortedDescending = numbers.sort((a, b) => b - a)
const sortedByProperty = objects.sort((a, b) => b.createdAt - a.createdAt)
\`\`\`

## **Safe Property Access**

- **Use \`get\`** for accessing nested properties safely
- **Prevents runtime errors** from null/undefined access

\`\`\`typescript
// ✅ DO: Use lodash get
import get from 'lodash/get'

const value = get(object, 'nested.property.path', defaultValue)
const count = get(response, 'data.meta.total_count', 0)

// ❌ DON'T: Direct property access without safety
const value = object.nested.property.path // Can throw if nested is undefined
const count = response.data.meta.total_count || 0 // Still unsafe
\`\`\`

## **Array Operations**

- **Use lodash array functions** for consistency and additional features

\`\`\`typescript
// ✅ DO: Use lodash functions
import filter from 'lodash/filter'
import map from 'lodash/map'
import find from 'lodash/find'
import isEmpty from 'lodash/isEmpty'
import uniq from 'lodash/uniq'

const filtered = filter(items, (item) => item.active)
const transformed = map(items, 'name')
const found = find(items, { status: 'active' })
const hasItems = !isEmpty(items)
const unique = uniq(values)

// ❌ DON'T: Use built-in methods when lodash equivalent exists
const filtered = items.filter((item) => item.active)
const hasItems = items.length > 0 // Use isEmpty for consistency
\`\`\`

## **Object Operations**

- **Use lodash object functions** for safer manipulation

\`\`\`typescript
// ✅ DO: Use lodash functions
import merge from 'lodash/merge'
import cloneDeep from 'lodash/cloneDeep'
import set from 'lodash/set'
import omit from 'lodash/omit'
import pick from 'lodash/pick'

const merged = merge({}, defaults, userConfig)
const cloned = cloneDeep(originalObject)
const updated = set(cloneDeep(object), 'path.to.prop', newValue)
const subset = pick(object, ['id', 'name', 'email'])

// ❌ DON'T: Use built-in methods that may be unsafe
const merged = { ...defaults, ...userConfig } // Shallow merge only
const cloned = JSON.parse(JSON.stringify(object)) // Unsafe for functions/dates
\`\`\`

## **Immutability Patterns**

- **Always create new objects/arrays** instead of mutating
- **Use lodash functions that return new instances**

\`\`\`typescript
// ✅ DO: Immutable operations
import set from 'lodash/set'
import orderBy from 'lodash/orderBy'
import cloneDeep from 'lodash/cloneDeep'

const updatedState = set(cloneDeep(state), 'user.preferences', newPrefs)
const sortedItems = orderBy(items, 'createdAt', 'desc') // Returns new array

// ❌ DON'T: Mutate original data
state.user.preferences = newPrefs // Mutates original
items.sort((a, b) => b.createdAt - a.createdAt) // Mutates original array
\`\`\`

## **Type Safety with Lodash**

- **Leverage TypeScript** with lodash for better type safety

\`\`\`typescript
// ✅ DO: Type-safe lodash operations
import get from 'lodash/get'
import orderBy from 'lodash/orderBy'

interface User {
  id: number
  name: string
  createdAt: Date
}

const users: User[] = []
const userName = get(users[0], 'name', 'Unknown') // string
const sortedUsers = orderBy(users, 'createdAt', 'desc') // User[]
\`\`\`

## **Performance Considerations**

- **Lodash is optimized** for common operations
- **Individual imports** ensure only used functions are bundled
- **Consistent patterns** make code easier to optimize

## **Migration Guidelines**

When updating existing code:

1. **Add lodash import** for the required function
2. **Replace built-in function** with lodash equivalent
3. **Test thoroughly** to ensure behavior is preserved
4. **Update any TypeScript types** if needed

## **Examples from Codebase**

Following this pattern from \`layout-table.tsx\`:

\`\`\`typescript
// Before
return baseOptions.sort((a, b) => b - a)

// After
import orderBy from 'lodash/orderBy'
return orderBy(baseOptions, (x) => x, 'desc')
\`\`\`

## **When Built-in Functions Are Acceptable**

- **Basic operations** where lodash doesn't provide additional value
- **Performance-critical paths** where built-in is faster
- **When lodash equivalent doesn't exist**

\`\`\`typescript
// ✅ Acceptable to use built-in
const length = array.length
const joined = parts.join('/')
const includes = string.includes('substring')
\`\`\`

Follow [no-classes.mdc](mdc:.cursor/rules/no-classes.mdc) for functional programming patterns and ensure lodash functions are consistently used throughout the codebase.`,
      order: 1,
    },
  ],
};

export class LodashPreferenceRule extends BaseRuleImpl {
  constructor() {
    super(lodashPreferenceConfig);
  }
}
