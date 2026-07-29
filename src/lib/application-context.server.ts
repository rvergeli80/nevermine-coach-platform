import { getCookie, setCookie } from "@tanstack/react-start/server";

/**
 * FEATURE-002.5 — Mecanismo de transporte del contexto activo (infraestructura).
 * Aislado en un módulo server-only: el dominio nunca conoce cookies ni HTTP.
 */

export const ACTIVE_SPORT_SPACE_COOKIE = "nvm_active_sport_space";

/** Lee el SportSpace solicitado por la sesión actual (mecanismo: cookie). */
export function readRequestedSportSpaceId(): string | null {
  return getCookie(ACTIVE_SPORT_SPACE_COOKIE) ?? null;
}

/** Persiste el SportSpace activo durante la sesión. */
export function writeActiveSportSpaceId(sportSpaceId: string) {
  setCookie(ACTIVE_SPORT_SPACE_COOKIE, sportSpaceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
  });
}
