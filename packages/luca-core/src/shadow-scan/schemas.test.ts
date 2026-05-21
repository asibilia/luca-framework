import { describe, expect, test } from 'bun:test'

import { ShadowScanFindingSchema, ShadowScanReportSchema } from './schemas.ts'

const validFinding = {
    category: 'orphaned-temp-script',
    severity: 'medium',
    file_path: 'debug-test.ts',
    description: "Matches denylist pattern 'debug-*.ts'.",
    recommendation: 'Delete — appears to be a temporary script.',
    recommended_action: 'delete',
    auto_fixable: true,
}

const validReport = {
    scan_mode: 'standard',
    categories_scanned: [1, 2, 3],
    findings: [validFinding],
    summary: { total: 1, critical: 0, high: 0, medium: 1, low: 0 },
    scanned_at: '2026-05-20T12:00:00Z',
}

describe('ShadowScanFindingSchema', () => {
    test('parses a valid delete finding', () => {
        const r = ShadowScanFindingSchema.safeParse(validFinding)
        expect(r.success).toBe(true)
    })

    test('parses a move finding with target_path', () => {
        const r = ShadowScanFindingSchema.safeParse({
            ...validFinding,
            recommended_action: 'move',
            target_path: '.luca/phases/01-x/execute/summary.md',
        })
        expect(r.success).toBe(true)
    })

    test.each(['critical', 'high', 'medium', 'low'])(
        'accepts severity %p',
        (severity) => {
            expect(
                ShadowScanFindingSchema.safeParse({
                    ...validFinding,
                    severity,
                }).success
            ).toBe(true)
        }
    )

    test('rejects unknown severity', () => {
        expect(
            ShadowScanFindingSchema.safeParse({
                ...validFinding,
                severity: 'blocker',
            }).success
        ).toBe(false)
    })

    test.each(['delete', 'move', 'gitignore'])(
        'accepts recommended_action %p',
        (action) => {
            expect(
                ShadowScanFindingSchema.safeParse({
                    ...validFinding,
                    recommended_action: action,
                }).success
            ).toBe(true)
        }
    )

    test('rejects unknown recommended_action', () => {
        expect(
            ShadowScanFindingSchema.safeParse({
                ...validFinding,
                recommended_action: 'archive',
            }).success
        ).toBe(false)
    })

    test('rejects empty file_path', () => {
        expect(
            ShadowScanFindingSchema.safeParse({
                ...validFinding,
                file_path: '',
            }).success
        ).toBe(false)
    })
})

describe('ShadowScanReportSchema', () => {
    test('parses a valid report', () => {
        const r = ShadowScanReportSchema.safeParse(validReport)
        expect(r.success).toBe(true)
    })

    test('parses a report with zero findings', () => {
        const r = ShadowScanReportSchema.safeParse({
            ...validReport,
            findings: [],
            summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
        })
        expect(r.success).toBe(true)
    })

    test.each(['quick', 'standard', 'full'])('accepts scan_mode %p', (mode) => {
        expect(
            ShadowScanReportSchema.safeParse({
                ...validReport,
                scan_mode: mode,
            }).success
        ).toBe(true)
    })

    test('rejects unknown scan_mode', () => {
        expect(
            ShadowScanReportSchema.safeParse({
                ...validReport,
                scan_mode: 'deep',
            }).success
        ).toBe(false)
    })

    test('rejects scanned_at that is not ISO datetime', () => {
        expect(
            ShadowScanReportSchema.safeParse({
                ...validReport,
                scanned_at: '2026-05-20',
            }).success
        ).toBe(false)
    })
})
