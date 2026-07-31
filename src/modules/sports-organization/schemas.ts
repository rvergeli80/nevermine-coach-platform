import { z } from "zod";

import { codeSchema, nameSchema } from "@/modules/config/schemas";

/**
 * FEATURE-004.1 — Esquemas de entrada del modelo organizativo.
 * Mismas reglas de validación para cualquier canal (web, MCP, CLI).
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

const optionalDate = z
  .string()
  .date()
  .optional()
  .nullable()
  .transform((v) => v ?? null);

export const seasonStateSchema = z.enum(["draft", "active", "closed", "archived"]);
export const competitionTypeSchema = z.enum([
  "league",
  "cup",
  "tournament",
  "internal_league",
  "friendly",
]);
export const orgEntityStatusSchema = z.enum(["active", "inactive", "archived"]);

export const sportIdSchema = z.object({ sportId: z.string().uuid() });

/* Categorías */
export const createCategorySchema = z.object({
  sportId: z.string().uuid(),
  code: codeSchema,
  name: nameSchema,
  description: optionalText(300),
  sortOrder: z.number().int().min(0).max(999).default(0),
});
export const updateCategorySchema = z.object({
  id: z.string().uuid(),
  name: nameSchema,
  description: optionalText(300),
  sortOrder: z.number().int().min(0).max(999).default(0),
  status: orgEntityStatusSchema,
});

/* Temporadas */
export const createOrgSeasonSchema = z.object({
  sportId: z.string().uuid(),
  name: nameSchema,
  startsOn: optionalDate,
  endsOn: optionalDate,
});
export const changeSeasonStateSchema = z.object({
  id: z.string().uuid(),
  state: seasonStateSchema,
});

/* Competiciones */
export const createOrgCompetitionSchema = z.object({
  seasonId: z.string().uuid(),
  name: nameSchema,
  type: competitionTypeSchema.default("league"),
});

/* Equipos */
export const createOrgTeamSchema = z.object({
  seasonId: z.string().uuid(),
  categoryId: z
    .string()
    .uuid()
    .optional()
    .nullable()
    .transform((v) => v ?? null),
  name: nameSchema,
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type CreateOrgSeasonInput = z.infer<typeof createOrgSeasonSchema>;
export type CreateOrgCompetitionInput = z.infer<typeof createOrgCompetitionSchema>;
export type CreateOrgTeamInput = z.infer<typeof createOrgTeamSchema>;
