import { describe, expect, test } from 'bun:test'

import { telemetryPathFor } from './telemetry-path-for.ts'

describe('telemetryPathFor', () => {
    test('builds JSONL path for an alphanumeric runId', () => {
        expect(telemetryPathFor('run-abc-123')).toBe(
            '.luca/telemetry/run-abc-123.jsonl'
        )
    })

    test('accepts ULID-shaped runIds', () => {
        const ulid = '01ARZ3NDEKTSV4RRFFQ69G5FAV'
        expect(telemetryPathFor(ulid)).toBe(`.luca/telemetry/${ulid}.jsonl`)
    })

    test('throws on runId with slashes', () => {
        expect(() => telemetryPathFor('bad/id')).toThrow()
    })

    test('throws on empty runId', () => {
        expect(() => telemetryPathFor('')).toThrow()
    })
})
