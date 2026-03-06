import { z } from "zod";

export const stepActivationSchema = z.enum(["skip", "optional", "run", "required", "required+thorough"]);

export const verificationModeSchema = z.enum(["quick", "standard", "full", "full+human"]);

export const learningCaptureSchema = z.enum(["skip", "brief", "standard", "full", "full+debrief"]);

export const cognitivePreflightSchema = z.enum(["skip", "lite", "full"]);

export const complexityLevelSchema = z.enum([
  "TRIVIAL",
  "SIMPLE",
  "MODERATE",
  "COMPLEX",
  "CRITICAL",
]);

export const gatingRulesSchema = z.object({
  cognitivePreflight: cognitivePreflightSchema,
  research: stepActivationSchema,
  discussion: stepActivationSchema,
  planVerificationIterations: z.number().min(0),
  harnessFixIterations: z.number().min(0),
  verifyFixIterations: z.number().min(0),
  verificationMode: verificationModeSchema,
  codeReviewAgents: z.array(z.string()),
  uat: stepActivationSchema,
  learningCapture: learningCaptureSchema,
});

export const complexityMatrixSchema = z.record(z.string(), gatingRulesSchema.partial());

export type StepActivation = z.infer<typeof stepActivationSchema>;
export type ComplexityLevel = z.infer<typeof complexityLevelSchema>;
export type GatingRules = z.infer<typeof gatingRulesSchema>;
export type ComplexityMatrix = z.infer<typeof complexityMatrixSchema>;
