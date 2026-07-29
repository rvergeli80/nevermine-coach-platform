import type { StarterPack, StarterPackSummary } from "./types";
import { compareVersions, isUpdateAvailable } from "./version";

/**
 * FEATURE-003.1 — Estado de instalación de un Starter Pack sobre un SportSpace.
 *
 * Reglas puras de decisión: qué significa "instalado", "desactualizado" o
 * "reinstalar". La infraestructura sólo persiste el resultado; la política
 * vive aquí y se comporta igual en cualquier canal (web, MCP, futuro).
 */

export type InstallationStatus = "installed" | "failed";
export type InstallationAction = "install" | "reinstall" | "update";

/** Registro de instalación tal y como lo devuelve la persistencia. */
export interface InstallationRecord {
  packId: string;
  version: string;
  checksum: string;
  status: InstallationStatus;
  installedAt: string;
  catalogId: string | null;
  catalogVersionId: string | null;
}

export type InstallationState =
  | "not_installed"
  | "installed"
  | "outdated"
  | "failed";

export interface StarterPackCatalogEntry extends StarterPackSummary {
  state: InstallationState;
  installedVersion: string | null;
  installedAt: string | null;
  latestVersion: string;
  updateAvailable: boolean;
  catalogId: string | null;
}

export function resolveInstallationState(
  pack: Pick<StarterPack, "version">,
  record: InstallationRecord | null,
): InstallationState {
  if (!record) return "not_installed";
  if (record.status === "failed") return "failed";
  return isUpdateAvailable(record.version, pack.version) ? "outdated" : "installed";
}

/**
 * Decide qué hace una petición de instalación.
 * Idempotencia: instalar la misma versión ya instalada, sin forzar, no hace nada.
 */
export function decideInstallAction(
  pack: Pick<StarterPack, "version">,
  record: InstallationRecord | null,
  options: { force?: boolean } = {},
): { action: InstallationAction } | { action: "noop"; reason: string } {
  if (!record || record.status === "failed") return { action: "install" };

  const diff = compareVersions(record.version, pack.version);
  if (diff < 0) return { action: "update" };
  if (options.force) return { action: "reinstall" };
  return {
    action: "noop",
    reason: `El pack ya está instalado en la versión ${record.version}.`,
  };
}

export function toCatalogEntry(
  summary: StarterPackSummary,
  record: InstallationRecord | null,
): StarterPackCatalogEntry {
  const state = resolveInstallationState(summary, record);
  return {
    ...summary,
    state,
    installedVersion: record?.version ?? null,
    installedAt: record?.installedAt ?? null,
    latestVersion: summary.version,
    updateAvailable: state === "outdated",
    catalogId: record?.catalogId ?? null,
  };
}
