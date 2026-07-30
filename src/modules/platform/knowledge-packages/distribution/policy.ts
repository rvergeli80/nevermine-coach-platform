/**
 * FEATURE-003.9 — Update Policy.
 *
 * La política dice *cómo* debe tratarse una actualización disponible, nunca la
 * aplica. Incluso con `automatic`, la plataforma se limita a recomendar: la
 * ejecución pasa siempre por el Installation Engine a petición del producto.
 * No existen actualizaciones automáticas silenciosas.
 */

import { parseVersion } from "../../semver";
import {
  DEFAULT_UPDATE_POLICY,
  isUpdatePolicy,
  type RecommendedAction,
  type UpdateKind,
  type UpdatePolicy,
} from "./types";

/** Resolución de la política declarada por un paquete, con valor por defecto. */
export function resolveUpdatePolicy(declared: unknown): UpdatePolicy {
  return isUpdatePolicy(declared) ? declared : DEFAULT_UPDATE_POLICY;
}

/** Tipo de salto entre la versión instalada y la disponible. */
export function classifyUpdate(installed: string | null, available: string | null): UpdateKind {
  if (!installed || !available) return "none";
  const from = parseVersion(installed);
  const to = parseVersion(available);
  if (to.major !== from.major) return to.major > from.major ? "major" : "none";
  if (to.minor !== from.minor) return to.minor > from.minor ? "minor" : "none";
  if (to.patch !== from.patch) return to.patch > from.patch ? "patch" : "none";
  return "none";
}

/**
 * Acción recomendada al consumidor.
 *  - `automatic` → `apply` (el producto puede encadenar la instalación).
 *  - `notify` → `confirm` (se muestra y se espera confirmación).
 *  - `manual` → `manual` (sólo bajo petición explícita).
 */
export function recommendAction(
  policy: UpdatePolicy,
  updateAvailable: boolean,
  compatible: boolean,
): RecommendedAction {
  if (!updateAvailable || !compatible) return "none";
  if (policy === "automatic") return "apply";
  if (policy === "notify") return "confirm";
  return "manual";
}
