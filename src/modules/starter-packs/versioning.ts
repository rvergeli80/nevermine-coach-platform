import {
  createVersioningService,
  type VersionLineage,
  type VersionRecord,
  type VersionSummary,
  type VersioningService,
} from "../platform/knowledge-packages";
import { knowledgePackages, starterPacks } from "./repository";
import { toKnowledgePackage, type StarterPackDescriptor } from "./knowledge-package";
import type { StarterPack } from "./types";

/**
 * FEATURE-003.6 — Versionado de las configuraciones de Coach.
 *
 * Coach **no** versiona por su cuenta: delega en el `VersioningService` de la
 * plataforma. Cada Starter Pack oficial es una configuración cuya evolución se
 * registra como una cadena de versiones inmutables, cada una con su snapshot
 * completo. Modificar una configuración = crear una versión nueva; jamás
 * reescribir una existente.
 */

export type StarterPackVersion = VersionRecord<StarterPack>;

/** Servicio de versionado propio de las configuraciones de Coach. */
export const configurationVersions: VersioningService<StarterPack> =
  createVersioningService<StarterPack>();

/**
 * Siembra el linaje con lo que hoy hay en el catálogo oficial. Cada versión
 * registrada del repositorio se convierte en un eslabón de la cadena, en orden
 * ascendente, para que el historial arranque completo y no desde cero.
 */
function seedFromRepository(): void {
  for (const pack of starterPacks) {
    const versions = knowledgePackages.versionsOf(pack.id) as StarterPackDescriptor[];
    for (const [index, descriptor] of versions.entries()) {
      const created = configurationVersions.createVersion({
        packageId: descriptor.id,
        semanticVersion: descriptor.version,
        snapshot: descriptor.payload,
        createdBy: descriptor.author ?? "Nevermine Official",
        changeType: index === 0 ? "initial" : "minor",
        reason: "Versión publicada en el catálogo oficial de Coach.",
        changeSummary: descriptor.summary,
        publicationState:
          knowledgePackages.stateOf(descriptor.id, descriptor.version) === "published"
            ? "published"
            : "unpublished",
        lifecycleState: knowledgePackages.stateOf(descriptor.id, descriptor.version) ?? descriptor.status,
        trustLevel: descriptor.trust,
      });
      // Un catálogo oficial mal encadenado es un defecto de datos, no un caso
      // de uso: se detiene el arranque antes de propagar historia inválida.
      if (!created.ok) {
        throw new Error(
          `No se pudo registrar el linaje de "${descriptor.id}@${descriptor.version}": ${created.errors.join(" ")}`,
        );
      }
    }
  }
}

seedFromRepository();

/** Historial cronológico de una configuración (autor, tipo y resumen). */
export function configurationHistory(packageId: string): readonly VersionSummary[] {
  return configurationVersions.getHistory(packageId);
}

/** Linaje completo: origen, versión actual y cadena recorrible en ambos sentidos. */
export function configurationLineage(packageId: string): VersionLineage<StarterPack> {
  return configurationVersions.getLineage(packageId);
}

/** Snapshot completo de una versión: se reconstruye sin recorrer sus ancestros. */
export function configurationSnapshot(
  packageId: string,
  semanticVersion: string,
): StarterPack | undefined {
  return configurationVersions.getVersion(packageId, semanticVersion)?.snapshot;
}

/**
 * Registra una nueva versión de una configuración de Coach. Es la **única**
 * puerta para hacer evolucionar un pack: el snapshot entra completo y el
 * salto semántico lo decide el tipo de cambio.
 */
export function recordConfigurationChange(input: {
  pack: StarterPack;
  changeType: "major" | "minor" | "patch";
  createdBy: string;
  reason: string;
  changeSummary: string;
  adr?: string | null;
  issue?: string | null;
}) {
  const descriptor = toKnowledgePackage(input.pack);
  const create =
    input.changeType === "major"
      ? configurationVersions.createMajor
      : input.changeType === "minor"
        ? configurationVersions.createMinor
        : configurationVersions.createPatch;

  return create.call(configurationVersions, {
    packageId: input.pack.id,
    snapshot: input.pack,
    createdBy: input.createdBy,
    reason: input.reason,
    changeSummary: input.changeSummary,
    adr: input.adr ?? null,
    issue: input.issue ?? null,
    lifecycleState: descriptor.status,
    trustLevel: descriptor.trust,
  });
}
