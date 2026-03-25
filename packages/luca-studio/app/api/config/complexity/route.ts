/**
 * PUT /api/config/complexity -- Update the complexity section of config.json.
 *
 * Validates the incoming payload against ComplexitySectionSchema and merges
 * it into the full config.json. No semantic validators -- schema-only.
 */
import { createConfigSectionHandler } from "~/lib/config-section-handler";
import { ComplexitySectionSchema } from "~/lib/config-section-schemas";

const handler = createConfigSectionHandler({
  section: "complexity",
  schema: ComplexitySectionSchema,
});

export async function PUT(request: Request) {
  return handler(request);
}
