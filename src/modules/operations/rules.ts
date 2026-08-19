import { failOperations, type OperativeSessionKind, type SessionKind } from "./types";

/**
 * FEATURE-004.2 — Invariantes de la operativa.
 *
 * Capa pura: recibe estructuras ya leídas y decide. No accede a persistencia,
 * de modo que cada invariante es verificable con un test unitario directo.
 */

export interface SeasonRef {
  id: string;
  sportId: string | null;
  state: string;
}

export interface TeamRef {
  id: string;
  seasonId: string | null;
  sportId: string;
  categoryId: string | null;
  status: string;
}

export interface CompetitionRef {
  id: string;
  seasonId: string | null;
  sportId: string | null;
}

export interface PlayerRef {
  id: string;
  teamId: string | null;
  status: string;
}

/** Una temporada cerrada o archivada no admite nueva operativa. */
export function assertSeasonOperable(season: SeasonRef | null): SeasonRef {
  if (!season) failOperations("La temporada no pertenece al SportSpace activo.");
  if (season.state === "closed" || season.state === "archived") {
    failOperations("La temporada está cerrada: no admite nuevos partidos ni entrenamientos.");
  }
  return season;
}

/** El equipo debe pertenecer a la temporada seleccionada y estar activo. */
export function assertTeamInSeason(team: TeamRef | null, seasonId: string): TeamRef {
  if (!team) failOperations("El equipo no pertenece al SportSpace activo.");
  if (team.seasonId !== seasonId) {
    failOperations("El equipo seleccionado no pertenece a la temporada elegida.");
  }
  if (team.status !== "active") {
    failOperations("El equipo seleccionado no está activo.");
  }
  return team;
}

/** La competición, si existe, debe compartir temporada y deporte con el equipo. */
export function assertCompetitionCompatible(
  competition: CompetitionRef | null,
  seasonId: string,
  sportId: string,
): void {
  if (!competition) return;
  if (competition.seasonId !== seasonId) {
    failOperations("La competición no pertenece a la temporada seleccionada.");
  }
  if (competition.sportId && competition.sportId !== sportId) {
    failOperations("La competición no pertenece al deporte del equipo.");
  }
}

/** Una competición sólo tiene sentido en un partido. */
export function assertCompetitionKind(
  kind: OperativeSessionKind,
  competitionId: string | null | undefined,
): void {
  if (kind === "training" && competitionId) {
    failOperations("Un entrenamiento no se disputa dentro de una competición.");
  }
}

/** Un jugador sólo puede observarse en la sesión de su propio equipo. */
export function assertPlayerInTeam(player: PlayerRef | null, teamId: string | null): PlayerRef {
  if (!player) failOperations("El jugador no pertenece al SportSpace activo.");
  if (!teamId || player.teamId !== teamId) {
    failOperations("El jugador seleccionado no pertenece al equipo de esta sesión.");
  }
  if (player.status !== "active") {
    failOperations("El jugador seleccionado no está activo.");
  }
  return player;
}

/** El tipo de evento del contexto debe ser partido o entrenamiento. */
export function assertOperativeKind(kind: SessionKind | null | undefined): OperativeSessionKind {
  if (kind !== "match" && kind !== "training") {
    failOperations(
      "Este contexto de observación no está clasificado como partido ni entrenamiento.",
    );
  }
  return kind;
}

/** Temporada de arranque: la activa si existe; si no, la primera operable. */
export function preferredSeasonId(seasons: readonly SeasonRef[]): string | null {
  const active = seasons.find((season) => season.state === "active");
  if (active) return active.id;
  const operable = seasons.find((season) => season.state === "draft");
  return operable?.id ?? seasons[0]?.id ?? null;
}

/** Estado temporal de una sesión: planificada (futura) o ya disputada. */
export type SessionSchedule = "planned" | "played";

export function sessionSchedule(occurredAt: string, now: Date = new Date()): SessionSchedule {
  return new Date(occurredAt).getTime() > now.getTime() ? "planned" : "played";
}

export const SESSION_SCHEDULE_LABELS: Record<SessionSchedule, string> = {
  planned: "Programada",
  played: "Realizada",
};
