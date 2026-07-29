import {
  SPORT_SPACE_TYPES,
  type NewSportSpace,
  type SportSpace,
  type SportSpaceType,
} from "./types";

/**
 * Invariantes del agregado SportSpace. Capa pura y testeable: la persistencia
 * replica estas reglas como CHECK constraints, pero la fuente de verdad
 * conceptual vive aquí.
 */

export const SPORT_SPACE_SLUG_PATTERN = /^[a-z][a-z0-9-]{1,39}$/;

export const SPORT_SPACE_NAME_MIN = 2;
export const SPORT_SPACE_NAME_MAX = 120;
export const SPORT_SPACE_DESCRIPTION_MAX = 500;

/** Deriva un slug candidato a partir de un nombre libre. */
export function slugifySportSpaceName(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return /^[a-z]/.test(base) ? base : `space-${base}`.slice(0, 40).replace(/-+$/g, "");
}

/**
 * Comprueba las invariantes de un SportSpace nuevo.
 * Devuelve la lista de problemas encontrados; vacía significa válido.
 */
export function checkNewSportSpace(input: NewSportSpace): string[] {
  const issues: string[] = [];
  const name = input.name.trim();

  if (name.length < SPORT_SPACE_NAME_MIN || name.length > SPORT_SPACE_NAME_MAX) {
    issues.push(
      `El nombre debe tener entre ${SPORT_SPACE_NAME_MIN} y ${SPORT_SPACE_NAME_MAX} caracteres.`,
    );
  }
  if (!SPORT_SPACE_SLUG_PATTERN.test(input.slug)) {
    issues.push(
      "El identificador sólo admite minúsculas, números y guiones, debe empezar por letra y tener entre 2 y 40 caracteres.",
    );
  }
  if ((input.description ?? "").length > SPORT_SPACE_DESCRIPTION_MAX) {
    issues.push(`La descripción no puede superar ${SPORT_SPACE_DESCRIPTION_MAX} caracteres.`);
  }
  if (!SPORT_SPACE_TYPES.includes(input.type)) {
    issues.push("Tipo de organización no soportado.");
  }

  return issues;
}

/** Un SportSpace archivado o inactivo no puede seguir operándose. */
export function isSportSpaceOperable(space: Pick<SportSpace, "status">): boolean {
  return space.status === "active";
}

/**
 * Autorización de lectura del agregado. En FEATURE-002.1 todavía no existe
 * Membership (FEATURE-002.2), por lo que la pertenencia se resuelve por creador.
 */
export function canReadSportSpace(space: Pick<SportSpace, "createdBy">, userId: string): boolean {
  return space.createdBy === userId;
}

export function sportSpaceTypeOrDefault(value: string | null | undefined): SportSpaceType {
  return SPORT_SPACE_TYPES.includes(value as SportSpaceType) ? (value as SportSpaceType) : "club";
}
