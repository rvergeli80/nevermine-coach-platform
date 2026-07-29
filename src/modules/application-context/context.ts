import type { ContextCandidate, ContextResolution } from "./types";

/**
 * Reglas de resolución del SportSpace activo (FEATURE-002.5).
 *
 * Invariantes:
 * - Sólo puede existir un SportSpace activo.
 * - El contexto siempre corresponde a una Membership válida del usuario.
 * - Resolver el contexto nunca modifica datos ni permisos.
 */

/** Orden determinista: primero donde es Owner, después por antigüedad. */
export function sortCandidates(
  candidates: readonly ContextCandidate[],
): readonly ContextCandidate[] {
  return [...candidates].sort((a, b) => {
    if (a.role !== b.role) return a.role === "owner" ? -1 : 1;
    if (a.joinedAt !== b.joinedAt) return a.joinedAt < b.joinedAt ? -1 : 1;
    return a.sportSpaceId < b.sportSpaceId ? -1 : 1;
  });
}

/** SportSpace por defecto cuando el usuario no ha elegido ninguno todavía. */
export function pickDefaultSportSpace(candidates: readonly ContextCandidate[]): string | null {
  const sorted = sortCandidates(candidates);
  return sorted.length > 0 ? sorted[0].sportSpaceId : null;
}

/**
 * Resuelve el contexto activo a partir de las Memberships del usuario y del
 * SportSpace solicitado (si lo hay). No conoce el mecanismo que transporta la
 * solicitud (cookie, cabecera, token): sólo su valor.
 */
export function resolveApplicationContext(input: {
  candidates: readonly ContextCandidate[];
  requestedSportSpaceId?: string | null;
}): ContextResolution {
  const { candidates } = input;
  const requested = input.requestedSportSpaceId ?? null;

  if (requested) {
    const match = candidates.some((c) => c.sportSpaceId === requested);
    if (!match) return { status: "forbidden", requestedSportSpaceId: requested };
    return { status: "resolved", sportSpaceId: requested, requested: true };
  }

  const fallback = pickDefaultSportSpace(candidates);
  if (!fallback) return { status: "empty" };
  return { status: "resolved", sportSpaceId: fallback, requested: false };
}

/** Un cambio de contexto sólo es válido hacia un SportSpace con Membership. */
export function canActivateSportSpace(
  candidates: readonly ContextCandidate[],
  sportSpaceId: string,
): boolean {
  return candidates.some((c) => c.sportSpaceId === sportSpaceId);
}
