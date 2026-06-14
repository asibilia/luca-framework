PERSPECTIVE: architecture
VERDICT: APPROVE

issues:
  - severity: LOW
    file: packages/luca-cli/src/init/helpers/wire-claude-hooks.ts:180-225
    line: "180-225 (wireAntigravityMcp) vs 437-495 (wireClaudeMcp)"
    issue: >-
      Atomic-write asymmetry between the two MCP writers. wireClaudeMcp uses
      temp-file + rename(2) + mode-preservation (never loosen a stricter
      existing mode); wireAntigravityMcp does a plain writeFile then chmod 0600.
      The doc-comment justification (claude.json is the user's PRIMARY config,
      far higher stakes) is sound and recorded — clobbering ~/.claude.json on a
      crash is catastrophic, while mcp_config.json is a dedicated single-purpose
      file luca fully owns. The inconsistency is therefore JUSTIFIED, not a
      defect. Two residual notes: (1) mcp_config.json still holds an inlined
      Bearer token, so a crash mid-write can leak a half-written token file at a
      readable mode until chmod runs — the atomic path would also close that
      narrow window; (2) wireAntigravityMcp hardcodes chmod 0o600 with no
      "never loosen" guard, a minor divergence from the Claude writer's
      mode-preservation. Both are quality parity items, not correctness bugs.
    suggestion: >-
      Optionally factor the shared read+parse-guard+token-gate+atomic-write
      boilerplate into one helper (e.g. mergeAndWriteMcpConfig(path, existing →
      next, { atomic, inlineToken })) and apply atomic+mode-preserve to both
      writers. Defer if the stakes asymmetry is the intended design — but record
      the decision so a future reader doesn't "fix" it into divergence.
    source_agent: code-architect

  - severity: LOW
    file: packages/luca-cli/src/init/helpers/wire-claude-hooks.ts:303-415
    line: "303-350 (mergeAntigravityMcpRegistration) vs 367-415 (mergeClaudeMcpRegistration)"
    issue: >-
      The two pure merge functions are now structurally parallel (spread-clone →
      authHeader → all-invariants idempotency guard → migrate-not-clobber
      destructure-omit of the foreign transport keys → rebuild canonical entry).
      This is good parity and exactly the symmetry the WS4 work targeted. The
      only duplication of substance is the idempotency-guard + destructure-omit +
      header-merge skeleton, which differs only in (a) the canonical key set
      (serverUrl/enabledTools vs type/url) and (b) which foreign keys to drop.
      Not worth abstracting now — the two transport shapes are genuinely
      distinct (Antigravity Streamable-HTTP serverUrl + enabledTools:['*'] vs
      Claude SSE type/url), and a shared generic would obscure that load-bearing
      difference behind config. Flagging only so the parallel structure is a
      conscious invariant: a change to one merge's guard logic should be mirrored
      in the other.
    suggestion: >-
      Keep separate. If a third harness arrives with yet another shape, revisit
      with a small descriptor-driven merge rather than a boolean-flag generic.
    source_agent: code-architect

  - severity: LOW
    file: packages/luca-cli/src/commands/init.ts:334-341
    line: "334-341"
    issue: >-
      Post-init readout cohesion gap (cosmetic). When agentSetupRan is true the
      readout unconditionally lists BOTH ~/.claude/ and ~/.gemini/antigravity-cli/
      as installed, regardless of which harnesses were actually in
      activeHarnesses. With the new WS8 gating it is now reachable for exactly
      one harness to be active (e.g. only ~/.claude exists, or --skip-antigravity
      given) yet the readout still claims both homes received skills/agents/hook.
      The success line at 252-256 correctly enumerates only active harnesses, so
      the readout contradicts it. Not a correctness bug — purely a misleading
      summary.
    suggestion: >-
      Drive the Directories readout from activeHarnesses (map h.home()/
      h.displayName) instead of the two hardcoded const home paths, so it stays
      in sync with what was actually wired.
    source_agent: code-architect

  - severity: LOW
    file: packages/luca-cli/src/utils/doctor/checks/muninn-mcp.ts:29-31
    line: "29-31, 81, 109"
    issue: >-
      isMuninnRegistered alignment with the new write target is CORRECT — it
      probes ~/.claude.json mcpServers (the wireClaudeMcp target), .mcp.json,
      the Antigravity mcp_config.json, and per-project entries, so the consumer
      tracks all producers. However the doctor check's remediation guidance
      (ADD_COMMAND = `claude mcp add ...`) and init.ts:368-383 still tell the
      user to run the old per-project `claude mcp add` shell-out that WS4
      explicitly REPLACED with the global ~/.claude.json file-merge. The detector
      is aligned; the human-facing fix text is stale and now points at the
      abandoned path.
    suggestion: >-
      Update ADD_COMMAND / the init readout fallback to recommend re-running
      `luca init` (which now performs the global file-merge) as the primary fix,
      keeping the manual `claude mcp add` only as a fallback. Cross-phase: touches
      doctor + init readout, outside this phase's wire-claude-hooks core.
    source_agent: code-architect

  - severity: LOW
    file: packages/luca-cli/src/init/helpers/harness.ts:33-75
    line: "33-75"
    issue: >-
      Interface/descriptor cohesion is good now that both harnesses carry an
      `mcp` member: the optional `mcp?: { wire }` shape and the Step-4 loop
      (`if (h.mcp) await h.mcp.wire(...)`) make MCP wiring uniform and
      data-driven, and the registry pattern (HARNESSES = [...]) delivers the
      "add one descriptor" extensibility the comment promises. Two cohesion
      observations: (1) `mcp` is declared optional but BOTH concrete harnesses
      define it, so the optionality is currently dead surface area — fine as
      forward-scaffolding but worth a comment that "MCP is expected, optional
      only for harnesses that genuinely lack an MCP surface". (2) wireHooks vs
      mcp.wire are asymmetric in the descriptor (one a bare method, one a nested
      object); a flatter `wireMcp?(opts)` would mirror `wireHooks(opts)` and read
      more cohesively. Both stylistic.
    suggestion: >-
      Consider flattening `mcp.wire` to `wireMcp?: (opts) => Promise<void>` to
      mirror wireHooks, or document why the nested namespace exists. No behavior
      change.
    source_agent: code-architect

CONSOLIDATED:
  MUST_FIX_COUNT: 0
  SHOULD_FIX_COUNT: 0
  NOTE_COUNT: 5
  CROSS_PHASE_COUNT: 1
