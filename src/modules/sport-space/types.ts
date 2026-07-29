/**
 * Agregado raíz SportSpace (FEATURE-002.1).
 *
 * Capa de dominio pura: sin dependencias de Supabase, React ni infraestructura.
 * El SportSpace es la futura unidad de aislamiento organizativo; en esta Feature
 * sólo se introduce la estructura, sin sustituir todavía el modelo `owner_id`.
 */

export type SportSpaceType = "club" | "federation" | "academy" | "personal";

export type SportSpaceStatus = "active" | "inactive" | "archived";

export interface SportSpace {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  type: SportSpaceType;
  status: SportSpaceStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** Datos necesarios para crear un SportSpace, antes de persistirlo. */
export interface NewSportSpace {
  slug: string;
  name: string;
  description: string | null;
  type: SportSpaceType;
}

export const SPORT_SPACE_TYPES: readonly SportSpaceType[] = [
  "club",
  "federation",
  "academy",
  "personal",
];

export const SPORT_SPACE_TYPE_LABELS: Record<SportSpaceType, string> = {
  club: "Club",
  federation: "Federación",
  academy: "Academia",
  personal: "Personal",
};
