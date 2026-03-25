/**
 * PUT /api/config/harness -- Update the harness section of config.json.
 *
 * Validates the incoming payload against HarnessSectionSchema and runs the
 * checkHarnessEnabled semantic validator to ensure at least one check type
 * remains enabled.
 */
import { createConfigSectionHandler } from "~/lib/config-section-handler";
import { HarnessSectionSchema } from "~/lib/config-section-schemas";
import type { HarnessCheck } from "~/lib/semantic-validators";
import { checkHarnessEnabled } from "~/lib/semantic-validators";

const handler = createConfigSectionHandler({
  section: "harness",
  schema: HarnessSectionSchema,
  semanticValidators: [
    (data) => {
      const harness = data as { checks: HarnessCheck[] };
      return checkHarnessEnabled(harness.checks);
    },
  ],
});

export async function PUT(request: Request) {
  return handler(request);
}
