/**
 * FEATURE-003.9 — Distribution Report.
 *
 * Vista agregada y reutilizable (UI, MCP, CLI) del estado de distribución:
 * qué hay publicado, qué instalaciones existen, cuáles están pendientes de
 * actualizar y cuáles no pueden hacerlo.
 */

import type {
  DistributionReport,
  DistributionReportRow,
  PublicationEntry,
  UpdateAvailability,
} from "./types";

export function toReportRow(availability: UpdateAvailability): DistributionReportRow {
  return { ...availability, scopeId: availability.scopeId ?? "" };
}

export function buildDistributionReport(input: {
  generatedAt: string;
  activePublications: readonly PublicationEntry[];
  availabilities: readonly UpdateAvailability[];
}): DistributionReport {
  const installations = input.availabilities.map(toReportRow);
  const pendingUpdates = installations.filter((r) => r.updateAvailable && r.compatible);
  const incompatibilities = installations.filter((r) => !r.compatible);
  // Una instalación sin ninguna versión publicada en los canales admitidos no
  // está "al día": simplemente no se distribuye. Se cuenta aparte.
  const unknown = installations.filter((r) => r.compatible && r.availableVersion === null);
  const upToDate = installations.filter(
    (r) => r.compatible && !r.updateAvailable && r.availableVersion !== null,
  );

  return {
    generatedAt: input.generatedAt,
    activePublications: [...input.activePublications],
    installations,
    pendingUpdates,
    incompatibilities,
    unknown,
    summary: {
      installations: installations.length,
      upToDate: upToDate.length,
      unknown: unknown.length,
      pendingUpdates: pendingUpdates.length,
      incompatibilities: incompatibilities.length,
      activePublications: input.activePublications.length,
    },
  };
}
