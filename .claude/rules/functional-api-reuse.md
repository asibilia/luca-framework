# Functional API Reuse & Architecture Rule

## rule

# Functional API Reuse & Architecture Rule

**CRITICAL ARCHITECTURE PRINCIPLE**: Always build on existing functionality rather than reinventing solutions. This is a mandatory architectural decision that must be followed in all code contributions.

## **Core Principles**

### **✅ DO: Build on Existing Robust Packages**

- **Leverage specialized packages** that already handle complexity
- **Extend functionality** rather than recreating it from scratch
- **Use existing APIs** that have been tested and optimized
- **Compose solutions** from proven building blocks

### **✅ DO: Create Simple, Generic Functional APIs**

- **Keep consumer code minimal** - ideally single function calls
- **Handle complexity in specialized packages** - not in consumers
- **Design for reusability** - functions should work across use cases
- **Provide automatic fallbacks** - failed operations should degrade gracefully

### **❌ DON'T: Reinvent the Wheel**

- **Don't duplicate logic** that already exists in robust packages
- **Don't write custom implementations** when proven solutions exist
- **Don't add complexity** to consumer code when packages can handle it
- **Don't ignore existing patterns** - follow established architectural decisions

## **Real-World Example: Template Processing**

### **❌ WRONG: Custom Implementation**

```typescript
// DON'T: 56 lines of manual template processing
function processInitialValuesTemplates(initialValues, context) {
  const processedValues = {}

  for (const [key, value] of Object.entries(initialValues)) {
    // Manual syntax detection
    const hasModernTemplate =
      isString(value) && value.includes('{{') && value.includes('}}')
    const hasLegacyTemplate =
      isString(value) && value.includes('<%') && value.includes('%>')

    if (hasModernTemplate || hasLegacyTemplate) {
      try {
        // Custom template processing logic
        const result = processTemplate(value, context)
        if (result.success) {
          processedValues[key] = result.result
        } else {
          logError(`Template processing failed: ${result.error}`)
          processedValues[key] = value
        }
      } catch (error) {
        logError(`Error: ${error}`)
        processedValues[key] = value
      }
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Manual recursion logic
      processedValues[key] = processInitialValuesTemplates(value, context)
    } else {
      processedValues[key] = value
    }
  }

  return processedValues
}

// Consumer code becomes complex
const processedInitialValues = processInitialValuesTemplates(initialValues)
```

### **✅ RIGHT: Extend Existing Package**

```typescript
// ✅ DO: Add generic function to shared templates package
export function processObjectTemplates(
  obj: Record<string, any>,
  context: Record<string, any> = {}
): Record<string, any> {
  const processed: Record<string, any> = {}

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      // Let processTemplate handle ALL complexity (syntax detection, error handling, caching)
      const result = processTemplate(value, context)
      processed[key] = result.success ? result.result : value
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Simple recursion
      processed[key] = processObjectTemplates(value, context)
    } else {
      // Keep non-string values as-is
      processed[key] = value
    }
  }

  return processed
}

// Consumer code becomes trivial
const processedInitialValues = processObjectTemplates(initialValues || {})
```

## **Benefits of This Approach**

### **🎯 For Developers**

- **Faster development** - no need to solve already-solved problems
- **Less bugs** - leverage tested, proven solutions
- **Easier maintenance** - centralized logic in specialized packages
- **Better consistency** - uniform behavior across codebase

### **🏗️ For Architecture**

- **Modular design** - clear separation of concerns
- **Reusable components** - functions work across different contexts
- **Easier testing** - test once in the specialized package
- **Better performance** - optimized implementations with caching

### **📦 For Packages**

- **Single responsibility** - each package has a clear purpose
- **Robust implementations** - handle edge cases and errors
- **Optimized solutions** - performance tuning in one place
- **Comprehensive APIs** - cover common use cases generically

## **Implementation Guidelines**

### **Before Adding New Functionality**

1. **Search existing packages** - is this problem already solved?
2. **Check established patterns** - how do similar features work?
3. **Identify the right package** - where should this functionality live?
4. **Design for reuse** - how can this help other parts of the codebase?

### **When Extending Packages**

1. **Follow existing patterns** - match the package's design philosophy
2. **Keep APIs simple** - minimize parameters, maximize automatic behavior
3. **Handle errors gracefully** - provide fallbacks and clear error messages
4. **Document thoroughly** - explain the function's purpose and usage

### **When Using Packages**

1. **Use the simplest API** - don't reinvent package functionality
2. **Trust the package** - let it handle complexity and edge cases
3. **Provide minimal context** - only pass what the package needs
4. **Handle results appropriately** - use success/error patterns

## **Package Examples**

### **Template Processing Package**

- **Handles**: Syntax detection, error handling, caching, global functions
- **Provides**: Simple APIs like `processTemplate()`, `processObjectTemplates()`
- **Consumer pattern**: Single function call with automatic fallbacks

### **Form Utilities Package**

- **Handles**: Form validation, serialization, field management
- **Provides**: Focused utilities like `serializeInitialValues()`
- **Consumer pattern**: Import specific helpers, compose as needed

### **Shared Utilities Package**

- **Handles**: Common operations, type conversions, data transformations
- **Provides**: Generic utilities that work across the codebase
- **Consumer pattern**: Import specific helpers, use with minimal configuration

## **Code Review Checklist**

- [ ] **Existing functionality check**: Is this problem already solved?
- [ ] **Package appropriateness**: Is this added to the right package?
- [ ] **API simplicity**: Can consumers use this with minimal code?
- [ ] **Error handling**: Does this fail gracefully with good fallbacks?
- [ ] **Reusability**: Can other parts of the codebase benefit from this?
- [ ] **Documentation**: Is the purpose and usage clear?

## **Anti-Patterns to Reject**

### **❌ Manual Syntax Detection**

```typescript
// DON'T: Detect template syntax manually
if (value.includes('{{') && value.includes('}}')) {
  // Custom processing...
}
```

### **❌ Duplicate Error Handling**

```typescript
// DON'T: Handle errors that packages already handle
try {
  const result = somePackageFunction(input)
  if (!result.success) {
    logError(result.error)
    return fallback
  }
} catch (error) {
  logError(error)
  return fallback
}
```

### **❌ Consumer-Side Complexity**

```typescript
// DON'T: Put complex logic in consumer code
const processedValues = {}
for (const [key, value] of Object.entries(data)) {
  if (isComplexCondition(value)) {
    processedValues[key] = complexProcessing(value)
  } else {
    processedValues[key] = simpleProcessing(value)
  }
}
```

## **Migration Strategy**

When refactoring existing code to follow this rule:

1. **Identify duplicate logic** across the codebase
2. **Find the appropriate package** to house the generic solution
3. **Create simple, reusable functions** in that package
4. **Update consumers** to use the package function
5. **Remove duplicate implementations**
6. **Update documentation** to reflect the new pattern

## **Enforcement**

- **Code reviews must check** for adherence to this principle
- **Pull requests should be rejected** if they reinvent existing functionality
- **New features should extend packages** rather than creating custom solutions
- **Refactoring should prioritize** moving logic to appropriate packages

## **Success Metrics**

- **Reduced code duplication** across the codebase
- **Faster feature development** due to reusable components
- **Fewer bugs** from leveraging tested packages
- **Easier maintenance** with centralized logic
- **Consistent behavior** across different features

Follow [no-classes.mdc](mdc:.cursor/rules/no-classes.mdc) for functional programming patterns.