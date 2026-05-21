# Plan 72-A: Wizard & Harness Selection

## Objective

Add harness multi-select to the wizard, update CLI args, and make file generation conditional per harness platform.

## Tasks

### T1: wizard.ts — Add harness multi-select + update config functions

- Import HarnessId type
- Add VALID_HARNESSES constant
- Add multiselect prompt between stack and tracker groups
- Update createConfigFromArgs() to accept harness param (comma-separated string)
- Update loadConfigFromFile() to parse harnesses array
- Return harnesses in all config outputs (default: ['claude', 'cursor'])

### T2: init.ts — Add --harness CLI arg

- Add harness arg definition (type: string, comma-separated)
- Include args.harness in quick mode detection
- Pass harness to createConfigFromArgs()

### T3: files.ts — Conditional scaffolding

- Resolve harnesses from config (default: ['claude', 'cursor'])
- Gate .claude/ directory creation on harnesses.includes('claude')
- Gate .cursor/ directory creation on harnesses.includes('cursor')
- Add .pi/ directory creation when harnesses.includes('pi')
- Gate hook installation per harness

### T4: init.ts — Update success output

- List harness-specific directories in success message

## Verification

- `bunx --bun tsc --noEmit` passes
- `bun test` passes
- createConfigFromArgs({ harness: 'claude,pi' }) returns { harnesses: ['claude', 'pi'] }

## Requirements Addressed

R2.1, R2.2, R2.3, R2.4
