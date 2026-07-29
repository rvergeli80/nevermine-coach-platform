/**
 * Nevermine Platform — Versionado semántico reducido (mayor.menor.parche).
 *
 * Capa de plataforma: no conoce ningún producto (Coach, Health, Legal…) ni
 * ningún Engine concreto. La usan el repositorio de Knowledge Packages y
 * cualquier producto construido encima.
 */

export interface SemanticVersion {
  major: number;
  minor: number;
  patch: number;
}

const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)$/;

export function isValidVersion(value: string): boolean {
  return typeof value === "string" && VERSION_RE.test(value.trim());
}

export function parseVersion(value: string): SemanticVersion {
  const match = VERSION_RE.exec(String(value).trim());
  if (!match) throw new Error(`Versión no válida: "${value}". Formato esperado mayor.menor.parche.`);
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

/** -1 si a < b, 0 si iguales, 1 si a > b. */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  for (const key of ["major", "minor", "patch"] as const) {
    if (va[key] < vb[key]) return -1;
    if (va[key] > vb[key]) return 1;
  }
  return 0;
}

/** ¿La versión instalada se ha quedado por detrás de la disponible? */
export function isUpdateAvailable(installed: string, available: string): boolean {
  return compareVersions(installed, available) < 0;
}

/** `version` satisface la versión mínima exigida. */
export function satisfiesMinVersion(version: string, minVersion: string): boolean {
  return compareVersions(version, minVersion) >= 0;
}

/** `version` no supera la versión máxima admitida (si la hay). */
export function satisfiesMaxVersion(version: string, maxVersion?: string | null): boolean {
  if (!maxVersion) return true;
  return compareVersions(version, maxVersion) <= 0;
}

/** Rango cerrado [min, max] con máximo opcional. */
export function satisfiesRange(
  version: string,
  range: { minVersion: string; maxVersion?: string | null },
): boolean {
  return satisfiesMinVersion(version, range.minVersion) && satisfiesMaxVersion(version, range.maxVersion);
}
