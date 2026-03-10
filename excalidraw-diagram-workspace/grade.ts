/**
 * Programmatic grader for excalidraw-diagram skill evaluations.
 *
 * Usage: bun run excalidraw-diagram-workspace/grade.ts <path-to-excalidraw-file> <eval-name>
 *
 * Outputs grading.json to the same directory as the input file.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

const filePath = process.argv[2];
const evalName = process.argv[3];

if (!filePath || !evalName) {
  console.error("Usage: bun run grade.ts <excalidraw-file> <eval-name>");
  process.exit(1);
}

interface GradingResult {
  eval_name: string;
  file_path: string;
  expectations: Array<{
    text: string;
    passed: boolean;
    evidence: string;
  }>;
  overall_pass: boolean;
}

function grade(filePath: string, evalName: string): GradingResult {
  const expectations: GradingResult["expectations"] = [];

  // 1. Valid JSON
  let data: any;
  try {
    const raw = readFileSync(filePath, "utf-8");
    data = JSON.parse(raw);
    expectations.push({
      text: "valid_json",
      passed: true,
      evidence: "File parsed as valid JSON",
    });
  } catch (e: any) {
    expectations.push({
      text: "valid_json",
      passed: false,
      evidence: `JSON parse error: ${e.message}`,
    });
    return {
      eval_name: evalName,
      file_path: filePath,
      expectations,
      overall_pass: false,
    };
  }

  // 2. Valid Excalidraw structure
  const hasType = data.type === "excalidraw";
  const hasVersion = data.version === 2;
  const hasElements = Array.isArray(data.elements);
  expectations.push({
    text: "valid_excalidraw_structure",
    passed: hasType && hasVersion && hasElements,
    evidence: `type=${data.type}, version=${data.version}, elements=${hasElements ? `array(${data.elements.length})` : typeof data.elements}`,
  });

  if (!hasElements) {
    return {
      eval_name: evalName,
      file_path: filePath,
      expectations,
      overall_pass: false,
    };
  }

  const elements: any[] = data.elements;

  // 3. Unique IDs
  const ids = elements.map((e) => e.id);
  const uniqueIds = new Set(ids);
  const dupeCount = ids.length - uniqueIds.size;
  expectations.push({
    text: "unique_ids",
    passed: dupeCount === 0,
    evidence:
      dupeCount === 0
        ? `All ${ids.length} IDs are unique`
        : `${dupeCount} duplicate IDs found`,
  });

  // 4. Bidirectional bindings
  const elementMap = new Map<string, any>();
  for (const el of elements) {
    elementMap.set(el.id, el);
  }

  let bindingErrors = 0;
  let bindingsChecked = 0;

  for (const el of elements) {
    if (el.type === "arrow" || el.type === "line") {
      for (const side of ["startBinding", "endBinding"]) {
        const binding = el[side];
        if (binding && binding.elementId) {
          bindingsChecked++;
          const target = elementMap.get(binding.elementId);
          if (!target) {
            bindingErrors++;
          } else if (
            !target.boundElements ||
            !Array.isArray(target.boundElements)
          ) {
            bindingErrors++;
          } else {
            const hasBound = target.boundElements.some(
              (b: any) => b.id === el.id,
            );
            if (!hasBound) bindingErrors++;
          }
        }
      }
    }

    // Check text containerId bindings
    if (el.type === "text" && el.containerId) {
      bindingsChecked++;
      const container = elementMap.get(el.containerId);
      if (!container) {
        bindingErrors++;
      } else if (
        !container.boundElements ||
        !Array.isArray(container.boundElements)
      ) {
        bindingErrors++;
      } else {
        const hasBound = container.boundElements.some(
          (b: any) => b.id === el.id && b.type === "text",
        );
        if (!hasBound) bindingErrors++;
      }
    }
  }

  expectations.push({
    text: "bidirectional_bindings",
    passed: bindingErrors === 0,
    evidence:
      bindingErrors === 0
        ? `All ${bindingsChecked} bindings are bidirectional`
        : `${bindingErrors}/${bindingsChecked} bindings are missing their counterpart`,
  });

  // 5. Has arrows
  const arrows = elements.filter((e) => e.type === "arrow");
  expectations.push({
    text: "has_arrows",
    passed: arrows.length > 0,
    evidence: `Found ${arrows.length} arrow elements`,
  });

  // 6. No overlapping shapes
  const shapes = elements.filter(
    (e) =>
      e.type === "rectangle" ||
      e.type === "ellipse" ||
      e.type === "diamond" ||
      e.type === "frame",
  );
  const positionSet = new Set<string>();
  let overlaps = 0;
  for (const s of shapes) {
    const key = `${s.x},${s.y}`;
    if (positionSet.has(key)) overlaps++;
    positionSet.add(key);
  }
  expectations.push({
    text: "no_overlapping_shapes",
    passed: overlaps === 0,
    evidence:
      overlaps === 0
        ? `No shape overlaps among ${shapes.length} shapes`
        : `${overlaps} shapes share exact positions`,
  });

  // Eval-specific assertions
  const allText = elements
    .filter((e) => e.type === "text")
    .map((e) => (e.text || "").toLowerCase())
    .join(" ");

  if (evalName === "login-flowchart") {
    // Has decision diamond
    const diamonds = elements.filter((e) => e.type === "diamond");
    expectations.push({
      text: "has_decision_diamond",
      passed: diamonds.length > 0,
      evidence: `Found ${diamonds.length} diamond elements`,
    });

    // Minimum element count
    const nonArrowElements = elements.filter(
      (e) => e.type !== "arrow" && e.type !== "line",
    );
    expectations.push({
      text: "minimum_element_count",
      passed: nonArrowElements.length >= 5,
      evidence: `Found ${nonArrowElements.length} non-arrow elements (need >= 5)`,
    });
  }

  if (evalName === "microservices-architecture") {
    const required = [
      "api gateway",
      "auth",
      "user service",
      "order",
      "postgres",
      "redis",
      "mongo",
    ];
    const found = required.filter((term) => allText.includes(term));
    const missing = required.filter((term) => !allText.includes(term));
    expectations.push({
      text: "all_services_present",
      passed: missing.length === 0,
      evidence:
        missing.length === 0
          ? `All ${required.length} services found in text`
          : `Missing: ${missing.join(", ")}. Found: ${found.join(", ")}`,
    });

    // Uses color
    const bgColors = new Set(
      shapes
        .map((s) => s.backgroundColor)
        .filter((c) => c && c !== "transparent"),
    );
    expectations.push({
      text: "uses_color",
      passed: bgColors.size >= 2,
      evidence: `Found ${bgColors.size} distinct background colors: ${[...bgColors].join(", ")}`,
    });
  }

  if (evalName === "blog-er-diagram") {
    const required = ["user", "post", "comment", "tag"];
    const found = required.filter((term) => allText.includes(term));
    const missing = required.filter((term) => !allText.includes(term));
    expectations.push({
      text: "all_entities_present",
      passed: missing.length === 0,
      evidence:
        missing.length === 0
          ? `All ${required.length} entities found`
          : `Missing: ${missing.join(", ")}`,
    });

    // Has relationship arrows with arrowheads
    const arrowsWithHeads = arrows.filter(
      (a) => a.startArrowhead || a.endArrowhead,
    );
    expectations.push({
      text: "has_relationship_arrows",
      passed: arrowsWithHeads.length > 0,
      evidence: `${arrowsWithHeads.length}/${arrows.length} arrows have arrowheads`,
    });

    // Crowfoot notation
    const crowfootArrows = arrows.filter(
      (a) =>
        (a.startArrowhead && a.startArrowhead.startsWith("crowfoot")) ||
        (a.endArrowhead && a.endArrowhead.startsWith("crowfoot")),
    );
    expectations.push({
      text: "has_crowfoot_notation",
      passed: crowfootArrows.length > 0,
      evidence:
        crowfootArrows.length > 0
          ? `${crowfootArrows.length} arrows use crowfoot notation`
          : "No crowfoot arrowheads found",
    });
  }

  if (evalName === "luca-state-machine") {
    const parentStates = [
      "idle",
      "preflight",
      "routing",
      "discussing",
      "planning",
      "executing",
      "verifying",
      "learning",
      "committing",
      "complete",
      "paused",
      "suspended",
      "failed",
    ];
    const found = parentStates.filter((s) => allText.includes(s));
    const missing = parentStates.filter((s) => !allText.includes(s));
    expectations.push({
      text: "all_parent_states_present",
      passed: missing.length === 0,
      evidence:
        missing.length === 0
          ? `All ${parentStates.length} parent states found`
          : `Missing: ${missing.join(", ")} (${found.length}/${parentStates.length} found)`,
    });

    const childStates = [
      "wave_executing",
      "wave_evaluating",
      "phase_verifying",
      "phase_fixing",
      "phase_done",
      "phase_blocked",
    ];
    // Check with underscores and without
    const childFound = childStates.filter(
      (s) => allText.includes(s) || allText.includes(s.replace(/_/g, " ")),
    );
    const childMissing = childStates.filter(
      (s) => !allText.includes(s) && !allText.includes(s.replace(/_/g, " ")),
    );
    expectations.push({
      text: "child_phase_actor_states",
      passed: childMissing.length === 0,
      evidence:
        childMissing.length === 0
          ? `All ${childStates.length} child states found`
          : `Missing: ${childMissing.join(", ")} (${childFound.length}/${childStates.length} found)`,
    });

    // Sufficient element count
    expectations.push({
      text: "sufficient_element_count",
      passed: elements.length >= 40,
      evidence: `${elements.length} total elements (need >= 40)`,
    });

    // Child actor grouped (check for frame or shared groupIds)
    const frames = elements.filter((e) => e.type === "frame");
    const groupedElements = elements.filter(
      (e) => e.groupIds && e.groupIds.length > 0,
    );
    const hasGrouping = frames.length > 0 || groupedElements.length > 0;
    expectations.push({
      text: "child_actor_grouped",
      passed: hasGrouping,
      evidence: `${frames.length} frames, ${groupedElements.length} grouped elements`,
    });
  }

  return {
    eval_name: evalName,
    file_path: filePath,
    expectations,
    overall_pass: expectations.every((e) => e.passed),
  };
}

// Run
const result = grade(filePath, evalName);
const outputDir = dirname(filePath);
const outputPath = join(outputDir, "..", "grading.json");
writeFileSync(outputPath, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
