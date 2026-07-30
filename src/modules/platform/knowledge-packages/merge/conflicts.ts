/**
 * FEATURE-003.8 — Detección y clasificación de conflictos.
 *
 * Un conflicto es un punto donde origen y destino afirman cosas distintas
 * sobre lo mismo. El motor nunca elige: lo detecta, lo clasifica y lo explica.
 */

import { satisfiesRange } from "../../semver";
import { TRUST_LEVELS } from "../governance";
import type { ComparedVersion } from "../comparison/types";
import type { ConflictCategory, MergeConflict } from "./types";

/** Familias de conocimiento cuya divergencia rompe a quien las consume. */
export const CRITICAL_KINDS = new Set([
  "capability",
  "dependency",
  "metric",
  "profile",
  "pack",
  "knowledge-pack",
]);

/** Estados de ciclo de vida que impiden usar una versión como origen. */
export const RETIRED_LIFECYCLE = new Set(["deprecated", "archived"]);

export function trustRank(level: string): number {
  const index = (TRUST_LEVELS as readonly string[]).indexOf(level);
  return index === -1 ? TRUST_LEVELS.length : index;
}

/** Gravedad de una divergencia de conocimiento según su familia. */
export function categoryForKind(kind: string): ConflictCategory {
  return CRITICAL_KINDS.has(kind) ? "BLOCKING" : "WARNING";
}

/**
 * Conflictos de gobierno: confianza y ciclo de vida. Son incompatibilidades
 * de la versión completa, no de un elemento concreto.
 */
export function detectGovernanceConflicts(
  source: ComparedVersion,
  target: ComparedVersion,
): MergeConflict[] {
  const conflicts: MergeConflict[] = [];

  if (trustRank(source.trustLevel) > trustRank(target.trustLevel)) {
    conflicts.push({
      category: "BLOCKING",
      code: "trust_downgrade",
      element: "metadata",
      path: "trustLevel",
      message: `Fusionar rebajaría la confianza de "${target.trustLevel}" a "${source.trustLevel}".`,
      sourceValue: source.trustLevel,
      targetValue: target.trustLevel,
    });
  } else if (source.trustLevel !== target.trustLevel) {
    conflicts.push({
      category: "INFO",
      code: "trust_differs",
      element: "metadata",
      path: "trustLevel",
      message: `El origen tiene confianza "${source.trustLevel}" y el destino "${target.trustLevel}": se conserva la del destino.`,
      sourceValue: source.trustLevel,
      targetValue: target.trustLevel,
    });
  }

  if (RETIRED_LIFECYCLE.has(source.lifecycleState)) {
    conflicts.push({
      category: "BLOCKING",
      code: "lifecycle_incompatible",
      element: "metadata",
      path: "lifecycleState",
      message: `La versión de origen está en estado "${source.lifecycleState}": no puede fusionarse.`,
      sourceValue: source.lifecycleState,
      targetValue: target.lifecycleState,
    });
  } else if (source.lifecycleState !== target.lifecycleState) {
    conflicts.push({
      category: "WARNING",
      code: "lifecycle_differs",
      element: "metadata",
      path: "lifecycleState",
      message: `Los ciclos de vida difieren ("${source.lifecycleState}" frente a "${target.lifecycleState}"): se conserva el del destino.`,
      sourceValue: source.lifecycleState,
      targetValue: target.lifecycleState,
    });
  }

  return conflicts;
}

/**
 * Conflicto de dependencias: la misma dependencia declarada con rangos que no
 * se solapan no puede resolverse automáticamente.
 */
export function detectDependencyConflict(
  id: string,
  sourceFields: Record<string, unknown>,
  targetFields: Record<string, unknown>,
): MergeConflict | null {
  const sourceMin = String(sourceFields.minVersion ?? "");
  const targetMin = String(targetFields.minVersion ?? "");
  if (!sourceMin || !targetMin) return null;

  const sourceMax = (targetFields.maxVersion ?? null) as string | null;
  const targetMax = (sourceFields.maxVersion ?? null) as string | null;

  // Los rangos se solapan si cada mínimo cabe en el rango contrario.
  const overlaps =
    satisfiesRange(sourceMin, targetMin, sourceMax) || satisfiesRange(targetMin, sourceMin, targetMax);
  if (overlaps) return null;

  return {
    category: "BLOCKING",
    code: "dependency_incompatible",
    element: "knowledge",
    path: `dependency:${id}`,
    message: `La dependencia "${id}" declara rangos incompatibles entre las dos versiones.`,
    sourceValue: sourceFields,
    targetValue: targetFields,
  };
}

/** Orden estable de conflictos: primero lo que bloquea, luego por ruta y código. */
const CATEGORY_ORDER: Record<ConflictCategory, number> = { BLOCKING: 0, WARNING: 1, INFO: 2 };

export function sortConflicts(conflicts: MergeConflict[]): MergeConflict[] {
  return [...conflicts].sort((a, b) => {
    if (a.category !== b.category) return CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category];
    if (a.path !== b.path) return a.path < b.path ? -1 : 1;
    return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
  });
}
