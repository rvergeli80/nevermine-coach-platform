import { z } from "zod";

/** FEATURE-004.2 — Contratos de entrada de la operativa (mismos en cualquier canal). */

export const sessionKindSchema = z.enum(["match", "training"]);

export const listSessionsSchema = z.object({
  seasonId: z.string().uuid().optional().nullable(),
  teamId: z.string().uuid().optional().nullable(),
  kind: sessionKindSchema.optional().nullable(),
});

export const createSessionSchema = z.object({
  kind: sessionKindSchema,
  seasonId: z.string().uuid(),
  teamId: z.string().uuid(),
  competitionId: z.string().uuid().optional().nullable(),
  occurredAt: z.string().min(4),
  label: z.string().trim().min(2, "Describe el partido o entrenamiento").max(120),
  notes: z.string().trim().max(500).optional().nullable(),
});

export const sessionIdSchema = z.object({ sessionId: z.string().uuid() });

export const sessionPlayerSchema = z.object({
  sessionId: z.string().uuid(),
  playerId: z.string().uuid(),
});

export const recordObservationSchema = sessionPlayerSchema.extend({
  values: z
    .array(
      z.object({
        metricId: z.string().uuid(),
        value: z.number().finite().nullable(),
      }),
    )
    .min(1, "Introduce al menos un valor observado"),
  reason: z.string().trim().max(300).optional().nullable(),
});

export const playerHistorySchema = z.object({
  playerId: z.string().uuid(),
  includeSuperseded: z.boolean().optional(),
});

export type ListSessionsInput = z.infer<typeof listSessionsSchema>;
export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type SessionPlayerInput = z.infer<typeof sessionPlayerSchema>;
export type RecordObservationInput = z.infer<typeof recordObservationSchema>;
export type PlayerHistoryInput = z.infer<typeof playerHistorySchema>;

export const auditTrailSchema = z.object({
  entityType: z
    .enum(["observation_context", "observation", "metric_value", "valuation"])
    .optional()
    .nullable(),
  teamId: z.string().uuid().optional().nullable(),
  playerId: z.string().uuid().optional().nullable(),
  limit: z.number().int().min(1).max(500).optional(),
});

export type AuditTrailInput = z.infer<typeof auditTrailSchema>;
