#!/usr/bin/env bun
/**
 * Skill eval runner — loads all skills with evals and reports them.
 *
 * Usage:
 *   bun scripts/eval-skills.ts                  # Display all evals
 *   bun scripts/eval-skills.ts --skill=debug    # Filter to one skill
 *   bun scripts/eval-skills.ts --json           # Machine-readable JSON output
 *
 * Note: Actual eval execution (sending prompts to Claude, grading responses)
 * is future work. This script validates eval schemas and reports what would
 * be tested.
 */
import { skillRegistry } from "~/skills/__helpers/build-skill-registry";
import { SkillEvalSchema } from "~/skills/__schemas/skill.schemas";

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);

const skillFilter = args.find((a) => a.startsWith("--skill="))?.split("=")[1];

const jsonOutput = args.includes("--json");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type EvalEntry = {
  skill: string;
  description: string;
  eval_index: number;
  prompt: string;
  expected: string;
  criteria: string[];
  schema_valid: boolean;
  schema_errors: string[];
};

type EvalSummary = {
  total_skills: number;
  skills_with_evals: number;
  total_evals: number;
  valid_evals: number;
  invalid_evals: number;
  entries: EvalEntry[];
};

// ---------------------------------------------------------------------------
// Load and validate evals
// ---------------------------------------------------------------------------
function loadEvals(): EvalSummary {
  const entries: EvalEntry[] = [];
  let skillsWithEvals = 0;
  let validCount = 0;
  let invalidCount = 0;

  const skillNames = Object.keys(skillRegistry).sort();
  const filteredNames = skillFilter
    ? skillNames.filter((n) => n === skillFilter)
    : skillNames;

  for (const name of filteredNames) {
    const factory = skillRegistry[name];
    if (!factory) continue;
    const skill = factory();
    const evals = skill.config.evals;

    if (!evals || evals.length === 0) continue;

    skillsWithEvals++;

    for (const [i, evalCase] of evals.entries()) {
      const parseResult = SkillEvalSchema.safeParse(evalCase);

      const entry: EvalEntry = {
        skill: name,
        description: skill.description,
        eval_index: i + 1,
        prompt: evalCase.prompt,
        expected: evalCase.expected,
        criteria: evalCase.criteria,
        schema_valid: parseResult.success,
        schema_errors: parseResult.success
          ? []
          : parseResult.error.issues.map(
              (issue) => `${issue.path.join(".")}: ${issue.message}`,
            ),
      };

      if (parseResult.success) {
        validCount++;
      } else {
        invalidCount++;
      }

      entries.push(entry);
    }
  }

  return {
    total_skills: filteredNames.length,
    skills_with_evals: skillsWithEvals,
    total_evals: entries.length,
    valid_evals: validCount,
    invalid_evals: invalidCount,
    entries,
  };
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------
function printHumanReadable(summary: EvalSummary): void {
  console.log("=".repeat(60));
  console.log(" Skill Eval Report");
  console.log("=".repeat(60));
  console.log();
  console.log(`Skills scanned:    ${summary.total_skills}`);
  console.log(`Skills with evals: ${summary.skills_with_evals}`);
  console.log(`Total evals:       ${summary.total_evals}`);
  console.log(`Valid:             ${summary.valid_evals}`);
  console.log(`Invalid:           ${summary.invalid_evals}`);
  console.log();

  let currentSkill = "";

  for (const entry of summary.entries) {
    if (entry.skill !== currentSkill) {
      currentSkill = entry.skill;
      console.log("-".repeat(60));
      console.log(`Skill: ${entry.skill}`);
      console.log(`  ${entry.description}`);
      console.log("-".repeat(60));
    }

    const status = entry.schema_valid ? "VALID" : "INVALID";
    console.log();
    console.log(`  [${status}] Eval ${entry.eval_index}:`);
    console.log(`    Prompt:   ${entry.prompt}`);
    console.log(`    Expected: ${entry.expected}`);
    console.log(`    Criteria:`);
    for (const c of entry.criteria) {
      console.log(`      [ ] ${c}`);
    }

    if (!entry.schema_valid) {
      console.log(`    Errors:`);
      for (const e of entry.schema_errors) {
        console.log(`      ! ${e}`);
      }
    }
  }

  console.log();
  console.log("=".repeat(60));

  if (summary.total_evals === 0) {
    console.log(
      skillFilter
        ? `No evals found for skill "${skillFilter}".`
        : "No evals found in any skill.",
    );
  } else {
    console.log(
      `${summary.valid_evals}/${summary.total_evals} evals ready for execution.`,
    );
  }

  console.log("=".repeat(60));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const summary = loadEvals();

if (jsonOutput) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  printHumanReadable(summary);
}

process.exit(summary.invalid_evals > 0 ? 1 : 0);
