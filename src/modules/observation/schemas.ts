import { z } from "zod";

/** FEATURE-004.1 — Contratos de entrada de la captura de observaciones. */

export const createObservationContextSchema = z.object({
  eventTypeId: z.string().uuid(),
  seasonId: z.string().uuid(),
  teamId: z.string().uuid().optional().nullable(),
  competitionId: z.string().uuid().optional().nullable(),
  catalogVersionId: z.string().uuid(),
  occurredAt: z.string().min(4),
  label: z.string().trim().min(2, "Describe la situación observada").max(120),
  notes: z.string().trim().max(500).optional().nullable(),
});

export const observationContextIdSchema = z.object({ contextId: z.string().uuid() });

export const captureSchema = z.object({
  contextId: z.string().uuid(),
  subjectType: z.enum(["player", "team"]),
  subjectId: z.string().uuid(),
});

export const saveObservationSchema = captureSchema.extend({
  values: z
    .array(
      z.object({
        metricId: z.string().uuid(),
        value: z.number().finite().nullable(),
      }),
    )
    .min(1, "Introduce al menos un valor observado"),
});

export const listValuationsSchema = z.object({
  seasonId: z.string().uuid().optional().nullable(),
  subjectId: z.string().uuid().optional().nullable(),
  includeSuperseded: z.boolean().optional(),
});

export type CreateObservationContextInput = z.infer<typeof createObservationContextSchema>;
export type SaveObservationInput = z.infer<typeof saveObservationSchema>;
export type CaptureQueryInput = z.infer<typeof captureSchema>;
export type ListValuationsInput = z.infer<typeof listValuationsSchema>;
