/**
 * PUT /api/config/lu -- Update the lu orchestration section of config.json.
 *
 * Validates the incoming payload against LuSectionSchema and merges
 * it into the full config.json. No semantic validators -- schema-only.
 */
import { createConfigSectionHandler } from "~/lib/config-section-handler";
import { LuSectionSchema } from "~/lib/config-section-schemas";

const handler = createConfigSectionHandler({
  section: "lu",
  schema: LuSectionSchema,
});

export async function PUT(request: Request) {
  return handler(request);
}
