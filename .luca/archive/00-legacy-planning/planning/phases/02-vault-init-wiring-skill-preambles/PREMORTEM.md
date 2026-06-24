# Pre-Mortem Risk Brief — Phase 2: Vault-Init Wiring + Skill Preambles

**Complexity:** SIMPLE | **Appetite:** Small (50k tokens, 40% context)

## Critical Risks

| Scenario                                                      | Likelihood | Impact | Mitigation                                                                                                                                                   | Detection                                                                                      |
| ------------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| **1. Stale Alias Not Cleaned Before Creation**                | MEDIUM     | MEDIUM | Call `cleanupStaleAlias()` FIRST (line order matters). Verify cleanup completes before `createAliasSkill()` is invoked.                                      | Test with existing alias skill directory; confirm old alias is removed before new one created. |
| **2. Skill Preamble Injection Breaks Markdown Parsing**       | MEDIUM     | HIGH   | Prepend preamble inside the `content` string property, not inside markdown fences. Test that skill compiler still extracts `main` section content correctly. | Read generated skill output post-build; verify both preamble text AND original content appear. |
| **3. Import Statement Placement Creates Circular Dependency** | LOW        | MEDIUM | Place imports at existing top of vault-init.ts imports section. Follow import-standards rule.                                                                | Run `bunx --bun tsc --noEmit` after edits; verify no circular deps.                            |

## Recommended Plan Constraints

- **Alias wiring insertion point**: Insert both function calls (cleanup, then create) in the success path after `generateFiles()`. Never skip cleanup.
- **Preamble placement**: Prepend branding instruction at the START of `main` section `content` property, before existing content.
- **Config reference in preambles**: Use literal strings `{commandPrefix}` and `{frameworkName}` as runtime instructions for the LLM, not build-time variables.
