/**
 * The final review in the board's state: its lenses, and where the review
 * stands.
 */
import { z } from 'zod'

import { FindingCountsSchema } from './board-state-ticket'

export const LENS_NAMES = [
    'architecture',
    'simplification',
    'security',
    'integration',
    'rules',
] as const

export const LensNameSchema = z.enum(LENS_NAMES)

export type LensName = z.infer<typeof LensNameSchema>

export const LensStateSchema = z.enum([
    'waiting',
    'reviewing',
    'fixing',
    'clean',
])

export type LensState = z.infer<typeof LensStateSchema>

export const LensCardSchema = z.object({
    name: LensNameSchema,
    state: LensStateSchema,
    findings: FindingCountsSchema,
})

export type LensCard = z.infer<typeof LensCardSchema>

export const FinalReviewStateSchema = z.enum([
    'waiting',
    'reviewing',
    'fixing',
    'stuck',
    'passed',
])

export type FinalReviewState = z.infer<typeof FinalReviewStateSchema>

export const FinalReviewSchema = z.object({
    state: FinalReviewStateSchema,
    /** False (drawn dimmed) until every ticket is done or skipped. */
    active: z.boolean(),
    round: z.number().int().min(0),
    fix_round: z.number().int().min(0),
    lenses: z.array(LensCardSchema),
    /** What was tried on it so far, oldest first. */
    tried: z.array(z.string()),
})

export type FinalReview = z.infer<typeof FinalReviewSchema>
