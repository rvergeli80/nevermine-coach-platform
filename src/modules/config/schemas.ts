import { z } from "zod";

/**
 * Esquemas de validación de la configuración del dominio (Fase 1A).
 * Capa pura: sin dependencias de infraestructura.
 */

export const codeSchema = z
  .string()
  .trim()
  .min(2, "El código debe tener al menos 2 caracteres")
  .max(40, "El código no puede superar 40 caracteres")
  .regex(
    /^[a-z][a-z0-9_]*$/,
    "El código sólo admite minúsculas, números y guion bajo, y debe empezar por letra",
  );

export const nameSchema = z.string().trim().min(2, "Nombre demasiado corto").max(120);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const entityStatusSchema = z.enum(["active", "inactive", "archived"]);
export const metricNatureSchema = z.enum(["primary", "derived"]);
export const metricValueTypeSchema = z.enum([
  "counter",
  "duration",
  "boolean",
  "ratio",
  "scale",
]);
export const metricDirectionSchema = z.enum([
  "higher_is_better",
  "lower_is_better",
  "neutral",
]);
export const subjectScopeSchema = z.enum(["individual", "collective"]);

export const idSchema = z.object({ id: z.string().uuid() });

// Deportes
export const createSportSchema = z.object({ code: codeSchema, name: nameSchema });
export const updateSportSchema = z.object({
  id: z.string().uuid(),
  name: nameSchema,
  status: entityStatusSchema,
});

// Temporadas
export const createSeasonSchema = z.object({
  name: nameSchema,
  startsOn: z.string().date().optional().nullable(),
  endsOn: z.string().date().optional().nullable(),
});
export const updateSeasonSchema = createSeasonSchema.extend({
  id: z.string().uuid(),
  status: entityStatusSchema,
});

// Competiciones
export const createCompetitionSchema = z.object({
  name: nameSchema,
  seasonId: z.string().uuid(),
});
export const updateCompetitionSchema = z.object({
  id: z.string().uuid(),
  name: nameSchema,
  seasonId: z.string().uuid(),
  status: entityStatusSchema,
});

// Catálogos
export const createCatalogSchema = z.object({
  sportId: z.string().uuid(),
  code: codeSchema,
  name: nameSchema,
  description: optionalText(500),
});
export const updateCatalogSchema = z.object({
  id: z.string().uuid(),
  name: nameSchema,
  description: optionalText(500),
  status: entityStatusSchema,
});

// Versiones
export const catalogIdSchema = z.object({ catalogId: z.string().uuid() });
export const createVersionSchema = z.object({
  catalogId: z.string().uuid(),
  changeReason: optionalText(300),
});
export const versionIdSchema = z.object({ versionId: z.string().uuid() });

// Grupos de métricas
export const createGroupSchema = z.object({
  catalogId: z.string().uuid(),
  code: codeSchema,
  name: nameSchema,
  color: optionalText(20),
  icon: optionalText(40),
  sortOrder: z.number().int().min(0).max(999).default(0),
});
export const updateGroupSchema = z.object({
  id: z.string().uuid(),
  name: nameSchema,
  color: optionalText(20),
  icon: optionalText(40),
  sortOrder: z.number().int().min(0).max(999),
  status: entityStatusSchema,
});

// Métricas
export const createMetricSchema = z.object({
  catalogId: z.string().uuid(),
  groupId: z.string().uuid().optional().nullable(),
  code: codeSchema,
  name: nameSchema,
  nature: metricNatureSchema,
  valueType: metricValueTypeSchema,
  direction: metricDirectionSchema,
  scope: subjectScopeSchema,
  unit: optionalText(20),
  shortDescription: optionalText(200),
  technicalDescription: optionalText(1000),
  icon: optionalText(40),
  color: optionalText(20),
});
export const updateMetricSchema = createMetricSchema
  .omit({ catalogId: true, code: true })
  .extend({ id: z.string().uuid(), status: entityStatusSchema });

export type CreateMetricInput = z.infer<typeof createMetricSchema>;
export type UpdateMetricInput = z.infer<typeof updateMetricSchema>;
