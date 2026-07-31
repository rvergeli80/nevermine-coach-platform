import type { Category, Competition, Season, SeasonState, Team } from "./types";

/**
 * FEATURE-004.1 — Invariantes del modelo organizativo.
 *
 * Reglas de negocio deterministas y puras. La base de datos las refuerza con
 * índices y RLS; aquí se expresan como reglas del dominio para poder
 * verificarlas y devolver mensajes comprensibles antes de tocar persistencia.
 */

export class SportsOrganizationError extends Error {}

export function fail(message: string): never {
  throw new SportsOrganizationError(message);
}

const normalize = (value: string) => value.trim().toLocaleLowerCase("es-ES");

/* --------------------------------- Temporada -------------------------------- */

/** Transiciones permitidas del ciclo de vida de una temporada. */
export const SEASON_TRANSITIONS: Record<SeasonState, readonly SeasonState[]> = {
  draft: ["active", "archived"],
  active: ["closed"],
  closed: ["archived"],
  archived: [],
};

export function canTransitionSeason(from: SeasonState, to: SeasonState): boolean {
  return SEASON_TRANSITIONS[from].includes(to);
}

export function assertSeasonTransition(from: SeasonState, to: SeasonState): void {
  if (from === to) fail("La temporada ya se encuentra en ese estado.");
  if (!canTransitionSeason(from, to)) {
    fail(`Transición de temporada no permitida: ${from} → ${to}.`);
  }
}

/** Invariante: como máximo una temporada activa por deporte. */
export function assertSingleActiveSeason(
  seasons: readonly Pick<Season, "id" | "sportId" | "state">[],
  candidate: { id?: string; sportId: string | null },
): void {
  const clash = seasons.find(
    (s) => s.state === "active" && s.sportId === candidate.sportId && s.id !== candidate.id,
  );
  if (clash) fail("Ya existe una temporada activa para este deporte.");
}

export function findActiveSeason(
  seasons: readonly Season[],
  sportId?: string | null,
): Season | null {
  return (
    seasons.find((s) => s.state === "active" && (!sportId || s.sportId === sportId)) ?? null
  );
}

/** Una temporada cerrada o archivada no admite nuevas estructuras. */
export function assertSeasonAcceptsStructure(season: Pick<Season, "state" | "name">): void {
  if (season.state === "closed" || season.state === "archived") {
    fail(`La temporada "${season.name}" está cerrada: no admite nuevas competiciones ni equipos.`);
  }
}

/* --------------------------------- Categorías ------------------------------- */

/** Invariante: la categoría pertenece a un deporte y es única dentro de él. */
export function assertUniqueCategory(
  categories: readonly Pick<Category, "id" | "sportId" | "code" | "name">[],
  candidate: { id?: string; sportId: string; code: string; name: string },
): void {
  const sameSport = categories.filter((c) => c.sportId === candidate.sportId && c.id !== candidate.id);
  if (sameSport.some((c) => c.code === candidate.code)) {
    fail("Ya existe una categoría con ese código en el deporte.");
  }
  if (sameSport.some((c) => normalize(c.name) === normalize(candidate.name))) {
    fail("Ya existe una categoría con ese nombre en el deporte.");
  }
}

export function assertCategoryBelongsToSport(
  category: Pick<Category, "sportId"> | null,
  sportId: string,
): void {
  if (category && category.sportId !== sportId) {
    fail("La categoría pertenece a otro deporte.");
  }
}

/* ------------------------------- Competiciones ------------------------------ */

/** Invariante: nombre único de competición dentro de una temporada. */
export function assertUniqueCompetition(
  competitions: readonly Pick<Competition, "id" | "seasonId" | "name">[],
  candidate: { id?: string; seasonId: string; name: string },
): void {
  const clash = competitions.some(
    (c) =>
      c.id !== candidate.id &&
      c.seasonId === candidate.seasonId &&
      normalize(c.name) === normalize(candidate.name),
  );
  if (clash) fail("Ya existe una competición con ese nombre en la temporada.");
}

/* ---------------------------------- Equipos --------------------------------- */

/** Invariante: nombre único de equipo dentro de una temporada. */
export function assertUniqueTeam(
  teams: readonly Pick<Team, "id" | "seasonId" | "name">[],
  candidate: { id?: string; seasonId: string; name: string },
): void {
  const clash = teams.some(
    (t) =>
      t.id !== candidate.id &&
      t.seasonId === candidate.seasonId &&
      normalize(t.name) === normalize(candidate.name),
  );
  if (clash) fail("Ya existe un equipo con ese nombre en la temporada.");
}
