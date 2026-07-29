/**
 * FEATURE-003.1 — Versionado de Starter Packs.
 *
 * Reexporta el versionado semántico de la plataforma (FEATURE-003.2): el
 * versionado es una capacidad de Nevermine Platform, no de Coach. Se mantiene
 * este punto de acceso para no romper a los consumidores del módulo.
 */

export {
  compareVersions,
  isUpdateAvailable,
  isValidVersion,
  parseVersion,
  satisfiesMaxVersion,
  satisfiesMinVersion,
  satisfiesRange,
  type SemanticVersion,
} from "../platform/semver";
