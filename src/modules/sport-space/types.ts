/**
 * Agregado raíz SportSpace (FEATURE-002.1).
 *
 * Capa de dominio pura: sin dependencias de Supabase, React ni infraestructura.
 * El SportSpace es la futura unidad de aislamiento organizativo; en esta Feature
 * FEATURE-002.4: es la unidad de aislamiento y de autorización del sistema.
 */

export type SportSpaceType =
  | "club"
  | "academy"
  | "federation"
  | "company"
  | "personal"
  | "other";

export type SportSpaceStatus = "active" | "inactive" | "archived";

export interface SportSpace {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  type: SportSpaceType;
  status: SportSpaceStatus;
  /**
   * Usuario autenticado que ejecutó la creación del SportSpace.
   * NO representa la propiedad del SportSpace: la propiedad se determinará
   * exclusivamente por la entidad Membership con rol Owner (FEATURE-002.2).
   */
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
  "academy",
  "federation",
  "company",
  "personal",
  "other",
];

export const SPORT_SPACE_TYPE_LABELS: Record<SportSpaceType, string> = {
  club: "Club",
  academy: "Academia",
  federation: "Federación",
  company: "Empresa",
  personal: "Personal",
  other: "Otro",
};
