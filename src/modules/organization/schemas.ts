import { z } from "zod";

import {
  SPORT_SPACE_DESCRIPTION_MAX,
  SPORT_SPACE_NAME_MAX,
  SPORT_SPACE_NAME_MIN,
  SPORT_SPACE_SLUG_PATTERN,
} from "./sport-space";

/** Contratos de entrada del agregado SportSpace (FEATURE-002.1). */

export const sportSpaceSlugSchema = z
  .string()
  .trim()
  .regex(
    SPORT_SPACE_SLUG_PATTERN,
    "El identificador sólo admite minúsculas, números y guiones, y debe empezar por letra",
  );

export const sportSpaceNameSchema = z
  .string()
  .trim()
  .min(SPORT_SPACE_NAME_MIN, "Nombre demasiado corto")
  .max(SPORT_SPACE_NAME_MAX);

export const sportSpaceTypeSchema = z.enum(["club", "federation", "academy", "personal"]);

export const createSportSpaceSchema = z.object({
  slug: sportSpaceSlugSchema,
  name: sportSpaceNameSchema,
  description: z
    .string()
    .trim()
    .max(SPORT_SPACE_DESCRIPTION_MAX)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  type: sportSpaceTypeSchema.default("club"),
});

export const sportSpaceIdSchema = z.object({ sportSpaceId: z.string().uuid() });

export type CreateSportSpaceInput = z.infer<typeof createSportSpaceSchema>;
