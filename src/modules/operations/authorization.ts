import type { OrgRole } from "@/modules/sports-organization";
import { failOperations } from "./types";

/**
 * FEATURE-004.2 — Authority de la operativa deportiva.
 *
 * Se apoya en los roles reales existentes de la Membership (`owner`, `coach`):
 * no se inventan roles nuevos. La UI puede ocultar acciones, pero el
 * enforcement vive en el Application Service y RLS es la última barrera.
 */

export type OpsAction =
  | "session:list"
  | "session:create"
  | "session:update"
  | "roster:read"
  | "observation:write"
  | "observation:correct"
  | "valuation:read"
  | "valuation:read_superseded";

export const OPS_POLICY: Record<OpsAction, readonly OrgRole[]> = {
  "session:list": ["owner", "coach"],
  "session:create": ["owner", "coach"],
  "session:update": ["owner", "coach"],
  "roster:read": ["owner", "coach"],
  "observation:write": ["owner", "coach"],
  "observation:correct": ["owner", "coach"],
  "valuation:read": ["owner", "coach"],
  "valuation:read_superseded": ["owner", "coach"],
};

export const OPS_ACTION_LABELS: Record<OpsAction, string> = {
  "session:list": "consultar partidos y entrenamientos",
  "session:create": "crear un partido o entrenamiento",
  "session:update": "modificar un partido o entrenamiento",
  "roster:read": "consultar los jugadores de un equipo",
  "observation:write": "registrar observaciones",
  "observation:correct": "corregir observaciones",
  "valuation:read": "consultar valoraciones",
  "valuation:read_superseded": "consultar valoraciones reemplazadas",
};

export function canOperate(role: OrgRole | null, action: OpsAction): boolean {
  return role !== null && OPS_POLICY[action].includes(role);
}

export function assertCanOperate(role: OrgRole | null, action: OpsAction): void {
  if (!role) {
    failOperations("No perteneces a este SportSpace: no puedes operar en él.");
  }
  if (!canOperate(role, action)) {
    failOperations(`Tu rol (${role}) no permite ${OPS_ACTION_LABELS[action]}.`);
  }
}

/** Lectura de la auditoría operativa: cualquier miembro del SportSpace. */
export const AUDIT_READ_ROLES: readonly OrgRole[] = ["owner", "coach"];
