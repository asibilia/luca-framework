/**
 * Verification Doctrine — evidence rules interpolated into verifier and
 * executor instruction bodies.
 *
 * SINGLE source of truth for probe requirements: change here once; every
 * consumer picks it up. Keep terse — tables not prose. The forbidden-language
 * phrase list is owned by luca-core's claim verifier and interpolated here.
 */
import { FORBIDDEN_LANGUAGE_PHRASES } from '@alecsibilia/luca-core/claim-verifier'

export const VERIFICATION_DOCTRINE = `## Verification Doctrine

**Evidence-in-same-tool-block rule.** No acceptance criterion may be marked met without tool evidence captured in the same (or immediately following) tool-call block that claims it. Claim and probe travel together.

**Per-artifact-type probes.**

| Artifact type | Required probe |
|---|---|
| file write | Read it back |
| code edit | Grep for the new symbol |
| command | Bash with checked output |
| HTTP/API | \`curl -i\` with status + body shape |
| deploy | live version string (not just successful push) |
| UI | screenshot |
| schema/DB | SELECT confirming migration |
| config/env | Read confirming value on disk |

**Dual-evidence fallback.** When a probe is stage-gate-blocked in REVIEWING, require BOTH executor attestation recorded in \`execute/waves/NN.md\` AND an independent structural probe, with the substitution noted in \`verify.json\` notes — never attestation alone.

**Forbidden language (without attached probe evidence).** ${FORBIDDEN_LANGUAGE_PHRASES.map(
    (phrase) => `'${phrase}'`
).join(', ')} — each forbidden only WITHOUT attached probe evidence; the phrases are fine when accompanied by tool output.

**[DEFERRED-VERIFY] protocol.** When a probe is genuinely impossible at execution time:
1. Mark the criterion \`[DEFERRED-VERIFY]\` with \`met: false\` + \`deferred: true\` + \`deferredFollowUp\`.
2. Create the tracked follow-up — capability branch:
   - **Subagents** (verifier/executor — no MCP access): record \`deferredFollowUp\` as the deterministic source string \`deferred-verify:<slug>:<ac-id>\` in verify.json AND RETURN the follow-up request verbatim in your structured output for the orchestrator to persist. The orchestrator runs \`luca todo add --source deferred-verify:<slug>:<ac-id>\` and executes the returned muninn instruction — never the subagent. The deterministic source string IS the join key; you never need a todo id at write time.
   - **Orchestrator-context readers**: run \`luca todo add\` with source \`deferred-verify:<slug>:<ac-id>\` directly.
3. The criterion cannot flip to met until the deferred probe runs.
`
