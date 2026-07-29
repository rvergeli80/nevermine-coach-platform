/**
 * FEATURE-003.1 — Versionado de Starter Packs.
 *
 * Capa de dominio pura: el versionado es semver reducido (mayor.menor.parche)
 * y no depende de infraestructura. Lo usan por igual el catálogo oficial, la
 * comprobación de compatibilidad con el Engine y el estado de instalación.
 */

export interface SemanticVersion {
  major: number;
  minor: number;
  patch: number;
}

const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)$/;

export function isValidVersion(value: string): boolean {
  return VERSION_RE.test(value.trim());
}

export function parseVersion(value: string): SemanticVersion {
  const match = VERSION_RE.exec(value.trim());
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

/** El Engine satisface la versión mínima exigida por el pack. */
export function satisfiesMinVersion(engineVersion: string, minVersion: string): boolean {
  return compareVersions(engineVersion, minVersion) >= 0;
}
