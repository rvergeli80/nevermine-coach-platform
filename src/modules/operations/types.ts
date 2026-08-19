/**
 * FEATURE-004.2 — Operativa de partidos y entrenamientos (dominio puro).
 *
 * Este módulo NO introduce una entidad de sesión propia: describe la semántica
 * operativa (Partido / Entrenamiento) sobre el contexto de observación ya
 * existente. No conoce Supabase, HTTP, React ni almacenamiento.
 */

/** Tipos operativos que el coach maneja. `other` cubre contextos legacy. */
export type SessionKind = "match" | "training" | "other";

export const SESSION_KIND_LABELS: Record<SessionKind, string> = {
  match: "Partido",
  training: "Entrenamiento",
  other: "Otro contexto",
};

/** Sólo estos dos tipos son seleccionables al crear una sesión operativa. */
export const OPERATIVE_SESSION_KINDS = ["match", "training"] as const;
export type OperativeSessionKind = (typeof OPERATIVE_SESSION_KINDS)[number];

export class OperationsError extends Error {}

export function failOperations(message: string): never {
  throw new OperationsError(message);
}
