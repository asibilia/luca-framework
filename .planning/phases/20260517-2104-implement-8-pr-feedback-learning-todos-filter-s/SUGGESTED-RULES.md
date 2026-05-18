# Suggested Rules

Recurring pitfalls detected at threshold >= 3 runs (out of 16 scanned).

These suggestions are **drafts**. Each is a starting template, not an automatic addition. Review the sample messages, decide whether the pattern is mechanically detectable, fill in the matcher, and commit the rule to `.luca/rules/`.

---

## WAVE_NO_VERIFICATION — 9 run(s), 11 occurrence(s)

**Suggested rule id**: `recurring/wave-no-verification`
**Pitfall concept**: `pitfall:wave-no-verification`
**Sample message**: Blocked attempt to advance wave without verification-result. Tool layer prevented the unsafe transition.

**Runs where this appeared**:
- run_mp7mz53d_zhbby8kj
- run_mp4r42w1_03llzawf
- run_mot10qqe_2gqytmiv
- run_mp355q53_pth2knu9
- run_mp4dq8j6_xwo9hsqz
- run_mox7pte0_bxfd8tt3
- run_mp39ql0h_w2tdw2jp
- run_mp5t215k_1gw0p37b
- run_movovw33_d6rp8pqb

**Draft rule** — copy to `.luca/rules/wave-no-verification.ts` and fill in the matcher:

```ts
/**
 * Auto-suggested rule from luca recurrence detection.
 *
 * This pitfall has appeared in 9 distinct run(s)
 * (11 total occurrence(s)).
 *
 * Sample violation message:
 *   Blocked attempt to advance wave without verification-result. Tool layer prevented the unsafe transition.
 *
 * NEXT STEPS:
 *   1. Decide what code pattern this rule should catch.
 *   2. Implement the matcher in the `check` function below.
 *      - Use `file.content` for regex checks.
 *      - Use `file.ast()` for AST-level matching.
 *   3. Set `scope` to the glob of files this rule should run against.
 *   4. Refine the severity (defaults to 'should-fix').
 *   5. Delete this comment block once the rule is real.
 *
 * The rule is exported as a plain duck-typed object so it works in any
 * consumer repo without a runtime dependency on the harness package.
 */

export default {
    id: 'recurring/wave-no-verification',
    severity: 'should-fix',
    description: 'WAVE_NO_VERIFICATION: Blocked attempt to advance wave without verification-result. Tool layer prevented the unsafe transition.',
    scope: 'src/**/*.ts',
    category: 'recurring',
    check: (file) => {
        // TODO: implement the check.
        // Example (regex):
        //   const findings = []
        //   const re = /badPattern/g
        //   let match
        //   while ((match = re.exec(file.content)) !== null) {
        //       const line = file.content.slice(0, match.index).split('\n').length
        //       findings.push({
        //           id: `recurring/wave-no-verification:${file.path}:${line}`,
        //           path: file.path,
        //           line,
        //           severity: 'should-fix',
        //           summary: 'Recurring pitfall detected',
        //       })
        //   }
        //   return findings
        return []
    },
}
```

---

## PIPELINE_GUARD_IDLE_BYPASS — 6 run(s), 6 occurrence(s)

**Suggested rule id**: `recurring/pipeline-guard-idle-bypass`
**Pitfall concept**: `pitfall:pipeline-guard-idle-bypass`
**Sample message**: Pipeline-guard skipped enforcement because pipelineStep was idle. May indicate stale state contamination.

**Runs where this appeared**:
- run_mp7mz53d_zhbby8kj
- run_mp4r42w1_03llzawf
- run_mot10qqe_2gqytmiv
- run_mp5t215k_1gw0p37b
- run_movovw33_d6rp8pqb
- run_mp5t0e9o_dsw15nf0

**Draft rule** — copy to `.luca/rules/pipeline-guard-idle-bypass.ts` and fill in the matcher:

```ts
/**
 * Auto-suggested rule from luca recurrence detection.
 *
 * This pitfall has appeared in 6 distinct run(s)
 * (6 total occurrence(s)).
 *
 * Sample violation message:
 *   Pipeline-guard skipped enforcement because pipelineStep was idle. May indicate stale state contamination.
 *
 * NEXT STEPS:
 *   1. Decide what code pattern this rule should catch.
 *   2. Implement the matcher in the `check` function below.
 *      - Use `file.content` for regex checks.
 *      - Use `file.ast()` for AST-level matching.
 *   3. Set `scope` to the glob of files this rule should run against.
 *   4. Refine the severity (defaults to 'should-fix').
 *   5. Delete this comment block once the rule is real.
 *
 * The rule is exported as a plain duck-typed object so it works in any
 * consumer repo without a runtime dependency on the harness package.
 */

export default {
    id: 'recurring/pipeline-guard-idle-bypass',
    severity: 'should-fix',
    description: 'PIPELINE_GUARD_IDLE_BYPASS: Pipeline-guard skipped enforcement because pipelineStep was idle. May indicate stale state contamination.',
    scope: 'src/**/*.ts',
    category: 'recurring',
    check: (file) => {
        // TODO: implement the check.
        // Example (regex):
        //   const findings = []
        //   const re = /badPattern/g
        //   let match
        //   while ((match = re.exec(file.content)) !== null) {
        //       const line = file.content.slice(0, match.index).split('\n').length
        //       findings.push({
        //           id: `recurring/pipeline-guard-idle-bypass:${file.path}:${line}`,
        //           path: file.path,
        //           line,
        //           severity: 'should-fix',
        //           summary: 'Recurring pitfall detected',
        //       })
        //   }
        //   return findings
        return []
    },
}
```
