/**
 * PUT /api/config/workflow -- Update the workflow section of config.json.
 *
 * Validates the incoming payload against WorkflowSectionSchema, merges
 * it into the full config.json, and returns the updated section with an ETag.
 */
import { createConfigSectionHandler } from "~/lib/config-section-handler";
import { WorkflowSectionSchema } from "~/lib/config-section-schemas";

const handler = createConfigSectionHandler({
  section: "workflow",
  schema: WorkflowSectionSchema,
});

export async function PUT(request: Request) {
  return handler(request);
}
