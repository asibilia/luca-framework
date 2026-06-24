// @alecsibilia/luca-tools — agent/skill/command/rule/hook definitions
// plus the harness-shape compiler.
//
// Phase A scaffolded this package; Phase D populates it.
// Surface area:
//   - ./define    — the Define* factories (D-1)
//   - ./compile   — the TS-to-Claude-Code compiler (D-2)
//   - ./artifacts — the canonical Artifact[] manifest (D-3)
//
// The three are deliberately separable: definition authors import from
// `./define`; the build pipeline imports from `./compile`; the manifest
// for the package's own shipped artifacts is `./artifacts`. The bare
// barrel below re-exports all three so existing consumers (the parity
// audit, downstream packages) can drop a single import.

export * from './define/index.ts'
export { compile, type CompileReport } from './compile/index.ts'
export { ARTIFACTS, MODES, SUBAGENTS } from './artifacts/index.ts'
