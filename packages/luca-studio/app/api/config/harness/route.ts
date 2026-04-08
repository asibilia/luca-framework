/**
 * PUT /api/config/harness -- Update the harness (verification checks) section of config.json.
 *
 * Validates the incoming payload against ChecksSectionSchema and runs the
 * checkChecksEnabled semantic validator to ensure at least one check type
 * remains enabled.
 */
import { createConfigSectionHandler } from "~/lib/config-section-handler";
import { ChecksSectionSchema } from "~/lib/config-section-schemas";
import type { CheckEntry } from "~/lib/semantic-validators";
import { checkChecksEnabled } from "~/lib/semantic-validators";

const handler = createConfigSectionHandler({
  section: "harness",
  schema: ChecksSectionSchema,
  semanticValidators: [
    (data) => {
      const checks = data as { checks: CheckEntry[] };
      return checkChecksEnabled(checks.checks);
    },
  ],
});

export async function PUT(request: Request) {
  return handler(request);
}
