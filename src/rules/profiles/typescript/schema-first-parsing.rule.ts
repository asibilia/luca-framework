/**
 * Enforce Zod schema-first parsing patterns over manual destructuring and default values
 */
import { createRule } from "../../base/base-rule";
import type { RuleConfig } from "../../types/rule.schemas";

// Define the schema-first-parsing rule configuration
const schemaFirstParsingConfig: RuleConfig = {
  frontmatter: {
    description: `Enforce Zod schema-first parsing patterns over manual destructuring and default values`,
    globs: ["**/*.{ts,tsx}"],
    alwaysApply: true,
  },
  sections: [
    {
      title: "rule",
      content: `# Schema-First Parsing Standards

This rule enforces consistent use of Zod schemas for parsing and validation instead of manual destructuring with default values.

## **Core Principles**

- **Single Source of Truth**: Schema defines ALL defaults, validation, and types
- **NO Destructuring Defaults**: NEVER set defaults during destructuring - always define in schema
- **Runtime Safety**: Use \`safeParse()\` over \`parse()\` to prevent runtime crashes
- **Type Safety**: Let TypeScript infer types from schemas, not manual casting
- **Consistency**: Uniform parsing patterns across all components

## **Required Patterns**

### **✅ DO: Schema-First Component Props**

\`\`\`typescript
// ✅ Define schema with defaults
export const ComponentPropsSchema = z.object({
  dateField: z.string().default('as_of_date'),
  titleField: z.string().default('title'),
  showAttachments: z.boolean().default(true),
  maxItems: z.number().default(10),
})

// ✅ Parse in component with safeParse
export function MyComponent({ props: rawProps = {} }) {
  const parseResult = ComponentPropsSchema.safeParse(rawProps)

  if (!parseResult.success) {
    console.error('Invalid component props:', parseResult.error)
    // Use schema defaults as fallback
    const defaultProps = ComponentPropsSchema.parse({})
    return <ErrorState />
  }

  const { dateField, titleField, showAttachments, maxItems } = parseResult.data

  // Use parsed, validated props...
}
\`\`\`

### **✅ DO: Safe Data Extraction**

\`\`\`typescript
// ✅ Schema-based data extraction
const DataSchema = z.object({
  id: z.string(),
  title: z.string().default('Untitled'),
  date: z.string().default(''),
  tags: z.array(z.string()).default([]),
})

export function processData(rawData: unknown) {
  const parseResult = DataSchema.safeParse(rawData)

  if (!parseResult.success) {
    return { error: parseResult.error.message }
  }

  const { id, title, date, tags } = parseResult.data
  // All fields are now type-safe with proper defaults
}
\`\`\`

### **✅ DO: Template Context Parsing**

\`\`\`typescript
// ✅ Schema-based context validation
const TemplateContextSchema = z.object({
  user: z.object({
    name: z.string().default('Anonymous'),
    email: z.string().email(),
  }),
  settings: z
    .object({
      theme: z.enum(['light', 'dark']).default('light'),
    })
    .default({}),
})

export function buildTemplateContext(rawContext: unknown) {
  const parseResult = TemplateContextSchema.safeParse(rawContext)

  if (!parseResult.success) {
    // Log error with context
    console.error('Template context validation failed:', {
      errors: parseResult.error.issues,
      context: rawContext,
    })

    // Return safe defaults
    return TemplateContextSchema.parse({})
  }

  return parseResult.data
}
\`\`\`

## **CRITICAL: No Defaults in Destructuring**

### **The Golden Rule**

> **NEVER set defaults during destructuring. ALWAYS define defaults in Zod schemas.**

This ensures a single source of truth and prevents default value drift.

### **✅ DO: Define All Defaults in Schema**

\`\`\`typescript
// ✅ CORRECT: All defaults in Zod schema
export const ComponentPropsSchema = z.object({
  rowData: z.array(z.any()).default([]),
  columnDefs: z.array(z.any()).default([]),
  pagination: z.boolean().default(false),
  paginationPageSize: z.number().int().positive().default(10),
  theme: z.enum(['alpine', 'quartz']).default('quartz'),
  loading: z.boolean().default(false),
  loadingText: z.string().default('Loading...'),
})

export type ComponentProps = z.infer<typeof ComponentPropsSchema>

// ✅ CORRECT: Parse props to apply schema defaults
export const Component: FunctionComponent<ComponentProps> = (rawProps) => {
  // Parse applies all defaults from schema
  const props = ComponentPropsSchema.parse(rawProps)

  const {
    rowData, // No default needed - schema provides []
    columnDefs, // No default needed - schema provides []
    pagination, // No default needed - schema provides false
    paginationPageSize, // No default needed - schema provides 10
    theme, // No default needed - schema provides 'quartz'
    loading, // No default needed - schema provides false
    loadingText, // No default needed - schema provides 'Loading...'
  } = props

  // Use props with guaranteed defaults...
}
\`\`\`

### **❌ DON'T: Set Defaults During Destructuring**

\`\`\`typescript
// ❌ WRONG: Defaults in component destructuring
export const BadComponent: FunctionComponent<ComponentProps> = ({
  rowData = [], // ❌ Default should be in schema
  columnDefs = [], // ❌ Default should be in schema
  pagination = false, // ❌ Default should be in schema
  paginationPageSize = 10, // ❌ Default should be in schema
  theme = 'quartz', // ❌ Default should be in schema
  loading = false, // ❌ Default should be in schema
  loadingText = 'Loading...', // ❌ Default should be in schema
}) => {
  // Props NOT validated, defaults can drift from schema
}

// ❌ WRONG: Mixed defaults
export const AnotherBadComponent = (props) => {
  const {
    field1 = 'default1', // ❌ Should be in schema
    field2 = 42, // ❌ Should be in schema
  } = props || {} // ❌ Should parse with schema
}
\`\`\`

### **Why This Matters**

1. **Single Source of Truth**: Schema is the only place defining defaults
2. **No Drift**: Defaults can't accidentally differ between locations
3. **Runtime Validation**: Schema validates types AND provides defaults
4. **Type Safety**: TypeScript infers correct types from schema
5. **Serializability**: Schema defaults are documented and portable
6. **Testability**: Easy to test default behavior by testing schema

### **Nested Configuration Objects**

\`\`\`typescript
// ✅ CORRECT: Nested defaults in schema
export const ValidationConfigSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(['sync', 'async', 'debounced']).default('async'),
  trigger: z.enum(['change', 'blur', 'submit']).default('blur'),
  debounceMs: z.number().int().positive().default(300),
})

// ✅ CORRECT: Parse nested config
export const Component = (rawProps) => {
  const props = ComponentPropsSchema.parse(rawProps)

  // Nested config already has defaults from schema
  const { validation } = props

  const {
    enabled, // No default needed
    mode, // Schema provided 'async'
    trigger, // Schema provided 'blur'
    debounceMs, // Schema provided 300
  } = validation || {}
}

// ❌ WRONG: Defaults in nested destructuring
const {
  enabled: validationEnabled = false, // ❌ Should be in schema
  mode: validationMode = 'async', // ❌ Should be in schema
  trigger: validationTrigger = 'blur', // ❌ Should be in schema
  debounceMs: validationDebounceMs = 300, // ❌ Should be in schema
} = validation || {}
\`\`\`

## **❌ DON'T: Anti-Patterns to Avoid**

### **❌ Manual Destructuring with Defaults**

\`\`\`typescript
// ❌ DON'T: Manual defaults (duplicates schema defaults)
export function BadComponent({ props }) {
  const {
    dateField = 'date', // Duplicates schema default
    titleField = 'title', // Duplicates schema default
    showAttachments = true, // Duplicates schema default
  } = props || {}

  // Manual type casting with fallbacks
  const title = (data[titleField] as string) || '' // ❌ Unsafe
}
\`\`\`

### **❌ Direct Parse() Usage**

\`\`\`typescript
// ❌ DON'T: Use parse() directly (throws on invalid data)
const props = ComponentPropsSchema.parse(rawProps) // Can crash at runtime

// ❌ DON'T: Manual type casting
const userId = (data.user_id as string) || 'default'
const count = Number(data.count) || 0
\`\`\`

### **❌ Mixed Parsing Approaches**

\`\`\`typescript
// ❌ DON'T: Mix manual and schema parsing
export function InconsistentComponent({ data, config = {} }) {
  // Manual defaults mixed with schema parsing
  const { endpoint = '/api/default' } = config
  const parsedConfig = ConfigSchema.parse(config) // Inconsistent!
}
\`\`\`

## **Error Handling Patterns**

### **✅ Graceful Degradation**

\`\`\`typescript
export function ComponentWithFallback({ data }) {
  const parseResult = DataSchema.safeParse(data)

  if (!parseResult.success) {
    // Log for debugging
    console.error('Data validation failed:', parseResult.error)

    // Render error state or use defaults
    return <EmptyState message="Invalid data" />
  }

  // Continue with validated data
  return <SuccessComponent data={parseResult.data} />
}
\`\`\`

### **✅ Development vs Production Error Handling**

\`\`\`typescript
const safeParseWithLogging = <T>(
  data: unknown,
  schema: z.ZodSchema<T>,
  componentName: string
): { success: true; data: T } | { success: false; error: string } => {
  const result = schema.safeParse(data)

  if (!result.success) {
    // Development: Detailed logging
    if (process.env.NODE_ENV === 'development') {
      console.error(\`\${componentName} validation failed:\`, {
        errors: result.error.issues,
        data,
      })
    }

    // Production: Clean error message
    return {
      success: false,
      error: \`Invalid \${componentName} configuration\`,
    }
  }

  return { success: true, data: result.data }
}
\`\`\`

## **Performance Considerations**

### **✅ Memoize Schema Parsing**

\`\`\`typescript
export function OptimizedComponent({ config }) {
  const parsedConfig = useMemo(() => {
    const result = ConfigSchema.safeParse(config)
    return result.success ? result.data : ConfigSchema.parse({})
  }, [config])

  // Use parsedConfig...
}
\`\`\`

### **✅ Schema Defaults Caching**

\`\`\`typescript
// Cache default values to avoid repeated parsing
const defaultProps = ComponentPropsSchema.parse({})

export function FastComponent({ props }) {
  const parseResult = ComponentPropsSchema.safeParse(props)
  const finalProps = parseResult.success ? parseResult.data : defaultProps

  // Use finalProps...
}
\`\`\`

## **Migration Guidelines**

### **Step 1: Identify Manual Patterns**

- Search for: \`const { field = 'default' } = props\`
- Search for: \`(data[field] as Type) || fallback\`
- Search for: \`.parse()\` usage without error handling

### **Step 2: Create/Update Schemas**

- Define comprehensive Zod schemas with defaults
- Include all validation rules and transformations
- Export type definitions: \`export type Props = z.infer<typeof PropsSchema>\`

### **Step 3: Replace Manual Parsing**

- Replace destructuring with \`schema.safeParse()\`
- Add proper error handling for invalid data
- Remove manual type casting and fallbacks

### **Step 4: Test Edge Cases**

- Test with invalid/missing data
- Verify error states render correctly
- Ensure defaults apply consistently

## **Benefits**

- **🛡️ Runtime Safety**: No crashes from invalid data
- **📏 Consistency**: Uniform parsing patterns across codebase
- **🔧 Maintainability**: Single source of truth for defaults
- **🎯 Type Safety**: Better TypeScript inference and checking
- **🐛 Debugging**: Clear validation error messages
- **📦 Bundle Size**: Reduced code duplication

## **Examples**

### **✅ Good Example: Table Component**

\`\`\`typescript
// schemas/table-props.ts
export const TablePropsSchema = z.object({
  rowData: z.array(z.any()).default([]),
  columns: z.array(z.any()).default([]),
  pagination: z.boolean().default(false),
  pageSize: z.number().int().positive().default(10),
  loading: z.boolean().default(false),
  loadingText: z.string().default('Loading...'),
  emptyText: z.string().default('No data to display'),
})

// components/table.tsx
export const Table: FunctionComponent<TableProps> = (rawProps) => {
  // Parse applies all defaults from schema
  const props = TablePropsSchema.parse(rawProps)

  const {
    rowData, // Schema provides []
    columns, // Schema provides []
    pagination, // Schema provides false
    // ... no defaults needed in destructuring
  } = props
}
\`\`\`

### **✅ Good Example: Nested Configuration**

\`\`\`typescript
// schemas/validation.ts
export const ValidationConfigSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(['sync', 'async', 'debounced']).default('async'),
  trigger: z.enum(['change', 'blur', 'submit']).default('blur'),
  debounceMs: z.number().int().positive().default(300),
})

// Component usage - no defaults in destructuring
const { validation } = props
const {
  enabled, // No default needed
  mode, // Schema provided 'async'
  trigger, // Schema provided 'blur'
  debounceMs, // Schema provided 300
} = validation || {}
\`\`\`

### **❌ Pattern to Migrate**

\`\`\`typescript
// ❌ WRONG: Defaults in destructuring
const { displayDateField = 'date', displayTitleField = 'title' } = props || {}
\`\`\`

## **Code Review Checklist**

When reviewing code, check for:

- [ ] All component props have Zod schema definitions
- [ ] All defaults are defined in schemas, not in destructuring
- [ ] Props are parsed using \`Schema.parse()\` or \`Schema.safeParse()\`
- [ ] No \`= defaultValue\` in destructuring statements
- [ ] Nested configuration objects also use schema defaults
- [ ] TypeScript types are inferred with \`z.infer<typeof Schema>\`
- [ ] Error handling for invalid props is in place

## **Quick Reference**

\`\`\`typescript
// ✅ DO THIS
const schema = z.object({ prop: z.string().default('value') })
const props = schema.parse(rawProps)
const { prop } = props

// ❌ NOT THIS
const { prop = 'value' } = rawProps
\`\`\`

Follow [import-standards.mdc](mdc:.cursor/rules/import-standards.mdc) for import organization and [no-classes.mdc](mdc:.cursor/rules/no-classes.mdc) for functional programming patterns.`,
      order: 1,
    },
  ],
};

export const schemaFirstParsingRule = createRule(schemaFirstParsingConfig);
