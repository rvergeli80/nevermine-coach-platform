import { fail } from "./rules";

/**
 * REMEDIATION-004 — Authority explícita del modelo organizativo.
 *
 * Capa pura: la política se expresa como datos, no como código disperso por
 * los handlers. Principios:
 *  - Authentication no implica Authority.
 *  - Membership no implica permiso total de escritura.
 *  - RLS permanece como defensa en profundidad, no como fuente semántica.
 *  - La UI puede ocultar acciones, pero el enforcement vive en el
 *    Application Service.
 */

export type OrgRole = "owner" | "coach";

export type OrgAction =
  | "organization:read"
  | "sport:write"
  | "category:write"
  | "season:write"
  | "season:transition"
  | "competition:write"
  | "team:write"
  | "player:write"
  | "history:read";

/** Política mínima propuesta (pendiente de ratificación de producto). */
export const ORG_POLICY: Record<OrgAction, readonly OrgRole[]> = {
  "organization:read": ["owner", "coach"],
  "sport:write": ["owner"],
  "category:write": ["owner"],
  "season:write": ["owner"],
  "season:transition": ["owner"],
  "competition:write": ["owner", "coach"],
  "team:write": ["owner", "coach"],
  "player:write": ["owner", "coach"],
  "history:read": ["owner", "coach"],
};

export const ORG_ACTION_LABELS: Record<OrgAction, string> = {
  "organization:read": "consultar la organización",
  "sport:write": "crear o editar deportes",
  "category:write": "crear o editar categorías",
  "season:write": "crear o editar temporadas",
  "season:transition": "cambiar el estado de una temporada",
  "competition:write": "crear o editar competiciones",
  "team:write": "crear o editar equipos",
  "player:write": "crear o editar jugadores",
  "history:read": "consultar el histórico",
};

export function can(role: OrgRole | null, action: OrgAction): boolean {
  return role !== null && ORG_POLICY[action].includes(role);
}

export function assertCan(role: OrgRole | null, action: OrgAction): void {
  if (!role) {
    fail("No perteneces a este SportSpace: no puedes operar sobre su organización.");
  }
  if (!can(role, action)) {
    fail(`Tu rol (${role}) no permite ${ORG_ACTION_LABELS[action]}.`);
  }
}
