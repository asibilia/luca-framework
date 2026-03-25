/**
 * PUT /api/config/planner -- Update the planner section of config.json.
 *
 * Validates the incoming payload against PlannerSectionSchema and merges
 * it into the full config.json. No semantic validators -- schema-only.
 */
import { createConfigSectionHandler } from "~/lib/config-section-handler";
import { PlannerSectionSchema } from "~/lib/config-section-schemas";

const handler = createConfigSectionHandler({
  section: "planner",
  schema: PlannerSectionSchema,
});

export async function PUT(request: Request) {
  return handler(request);
}
