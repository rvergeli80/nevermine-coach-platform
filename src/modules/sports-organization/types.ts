/**
 * FEATURE-004.1 — Sports Organization (Sports Domain Engine).
 *
 * Capa de dominio pura: describe el modelo organizativo oficial
 * (Sport → Category / Season → Competition / Team) sin conocer Supabase,
 * React ni transporte alguno. El ámbito organizativo (SportSpace) se recibe
 * siempre resuelto desde el ApplicationContext.
 */

export type EntityStatus = "active" | "inactive" | "archived";

/** Ciclo de vida propio de una temporada. */
export type SeasonState = "draft" | "active" | "closed" | "archived";

export type CompetitionType =
  | "league"
  | "cup"
  | "tournament"
  | "internal_league"
  | "friendly";

export interface Sport {
  id: string;
  sportSpaceId: string | null;
  code: string;
  name: string;
  description: string | null;
  status: EntityStatus;
}

/** Categoría: siempre pertenece a un deporte concreto, nunca es global. */
export interface Category {
  id: string;
  sportSpaceId: string;
  sportId: string;
  code: string;
  name: string;
  description: string | null;
  sortOrder: number;
  status: EntityStatus;
}

export interface Season {
  id: string;
  sportSpaceId: string;
  sportId: string | null;
  name: string;
  startsOn: string | null;
  endsOn: string | null;
  state: SeasonState;
}

export interface Competition {
  id: string;
  sportSpaceId: string;
  sportId: string | null;
  seasonId: string | null;
  name: string;
  type: CompetitionType;
  status: EntityStatus;
}

export interface Team {
  id: string;
  sportSpaceId: string;
  sportId: string;
  seasonId: string | null;
  categoryId: string | null;
  name: string;
  status: EntityStatus;
}

export const SEASON_STATES: readonly SeasonState[] = ["draft", "active", "closed", "archived"];

export const SEASON_STATE_LABELS: Record<SeasonState, string> = {
  draft: "Borrador",
  active: "Activa",
  closed: "Cerrada",
  archived: "Archivada",
};

export const COMPETITION_TYPES: readonly CompetitionType[] = [
  "league",
  "cup",
  "tournament",
  "internal_league",
  "friendly",
];

export const COMPETITION_TYPE_LABELS: Record<CompetitionType, string> = {
  league: "Liga",
  cup: "Copa",
  tournament: "Torneo",
  internal_league: "Liga interna",
  friendly: "Amistosos",
};
