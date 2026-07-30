/**
 * FEATURE-003.5 — Resolución de versiones de instalación.
 *
 * Decide, sin efectos secundarios, qué significa aplicar una versión sobre lo
 * que ya está instalado. Versionado reducido (mayor.menor.parche) reutilizando
 * el semver de la plataforma: no hay rangos ni etiquetas.
 */

import { compareVersions } from "../../semver";

/** Relación entre la versión instalada y la solicitada. */
export type VersionChange = "first_install" | "same" | "upgrade" | "downgrade";

/** Operación que la resolución determina para el motor de instalación. */
export type InstallationOperation = "install" | "update" | "rollback" | "reinstall" | "noop";

export interface VersionResolution {
  change: VersionChange;
  operation: InstallationOperation;
  from: string | null;
  to: string;
  reason: string | null;
}

export function resolveVersionChange(installed: string | null, target: string): VersionChange {
  if (!installed) return "first_install";
  const diff = compareVersions(installed, target);
  if (diff === 0) return "same";
  return diff < 0 ? "upgrade" : "downgrade";
}

/**
 * Resolución completa. Reinstalar la misma versión sólo ocurre con `force`;
 * sin él, la operación es idempotente y no toca nada.
 */
export function resolveInstallation(
  installed: string | null,
  target: string,
  options: { force?: boolean } = {},
): VersionResolution {
  const change = resolveVersionChange(installed, target);
  if (change === "first_install") {
    return { change, operation: "install", from: null, to: target, reason: null };
  }
  if (change === "upgrade") {
    return { change, operation: "update", from: installed, to: target, reason: null };
  }
  if (change === "downgrade") {
    return { change, operation: "rollback", from: installed, to: target, reason: null };
  }
  if (options.force) {
    return { change, operation: "reinstall", from: installed, to: target, reason: null };
  }
  return {
    change,
    operation: "noop",
    from: installed,
    to: target,
    reason: `La versión ${target} ya está instalada.`,
  };
}
