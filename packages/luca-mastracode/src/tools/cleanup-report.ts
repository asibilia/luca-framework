/**
 * cleanup-report — parse and validate shadow-scanner subagent output.
 *
 * The shadow-scanner subagent emits a JSON report at the end of its response.
 * This module pulls the JSON out (fenced block first, then bare object), runs
 * it through the canonical schema, and formats the human-readable banner.
 */
import { ShadowScanReportSchema } from '../state/shadow-scanner.js'

export type ParseReportResult =
    | {
          report: ReturnType<typeof ShadowScanReportSchema.parse>
          banner: string
          has_critical: boolean
          has_actionable: boolean
      }
    | { error: string; hint?: string; detail?: string; issues?: string[] }

export function parseShadowScanReport(rawOutput: string): ParseReportResult {
    // Extract JSON block from the scanner output.
    // Try fenced ```json block first, then raw JSON object.
    let jsonStr: string | undefined
    const jsonMatch = rawOutput.match(/```json\s*\n([\s\S]*?)\n\s*```/)
    if (jsonMatch?.[1]) {
        jsonStr = jsonMatch[1]
    } else {
        const rawMatch = rawOutput.match(/(\{[\s\S]*"scan_mode"[\s\S]*\})\s*$/)
        if (rawMatch?.[1]) {
            jsonStr = rawMatch[1]
        }
    }

    if (!jsonStr) {
        return {
            error: 'No JSON block found in scanner output',
            hint: 'The shadow-scanner subagent should emit a ```json block at the end of its response, or the raw_output should contain a JSON object with a scan_mode key.',
        }
    }

    let parsed
    try {
        parsed = JSON.parse(jsonStr)
    } catch (e) {
        return {
            error: 'Failed to parse JSON from scanner output',
            detail: String(e),
        }
    }

    const result = ShadowScanReportSchema.safeParse(parsed)
    if (!result.success) {
        return {
            error: 'Scanner output does not match ShadowScanReport schema',
            issues: result.error.issues.map(
                (i) => `${i.path.join('.')}: ${i.message}`
            ),
        }
    }

    const report = result.data
    const { summary } = report

    const banner = [
        `Shadow Scan Complete — ${report.scan_mode} mode`,
        `Categories scanned: ${report.categories_scanned.join(', ')}`,
        ``,
        `  Total:    ${summary.total}`,
        `  Critical: ${summary.critical}`,
        `  High:     ${summary.high}`,
        `  Medium:   ${summary.medium}`,
        `  Low:      ${summary.low}`,
    ].join('\n')

    return {
        report,
        banner,
        has_critical: summary.critical > 0,
        has_actionable: summary.total > 0,
    }
}
