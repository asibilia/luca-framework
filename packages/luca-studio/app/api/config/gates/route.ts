/**
 * PUT /api/config/gates -- Update the gates section of config.json.
 *
 * Validates the incoming payload against GatesSectionSchema and runs the
 * checkRequiredGates semantic validator to ensure safety-critical gates
 * (confirm_project, confirm_phases) remain enabled.
 */
import { createConfigSectionHandler } from "~/lib/config-section-handler";
import { GatesSectionSchema } from "~/lib/config-section-schemas";
import { checkRequiredGates } from "~/lib/semantic-validators";

const handler = createConfigSectionHandler({
  section: "gates",
  schema: GatesSectionSchema,
  semanticValidators: [
    (data) =>
      checkRequiredGates(
        data as Record<string, boolean>,
        ["confirm_project", "confirm_phases"],
      ),
  ],
});

export async function PUT(request: Request) {
  return handler(request);
}
