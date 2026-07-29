/**
 * FEATURE-002.5 — Contexto de aplicación.
 *
 * Capa pura: describe el contrato del contexto activo sin conocer cookies,
 * cabeceras, JWT, Request ni almacenamiento del navegador. La infraestructura
 * resuelve el contexto; el dominio sólo consume esta abstracción.
 */

/** Contexto de aplicación resuelto: un único SportSpace activo por sesión. */
export interface ApplicationContext {
  userId: string;
  sportSpaceId: string;
}

/** Candidato a contexto activo: una Membership válida del usuario. */
export interface ContextCandidate {
  sportSpaceId: string;
  role: "owner" | "coach";
  joinedAt: string;
}

export type ContextResolution =
  | { status: "resolved"; sportSpaceId: string; requested: boolean }
  /** El usuario no pertenece al SportSpace solicitado: acceso denegado. */
  | { status: "forbidden"; requestedSportSpaceId: string }
  /** El usuario no pertenece a ningún SportSpace: no hay contexto posible. */
  | { status: "empty" };

/** Mensajes de error controlados de la capa de aplicación. */
export const CONTEXT_FORBIDDEN_MESSAGE =
  "No perteneces a este SportSpace: no puedes activarlo como contexto de trabajo.";
export const CONTEXT_EMPTY_MESSAGE =
  "No hay ningún SportSpace activo: necesitas pertenecer al menos a una organización.";
