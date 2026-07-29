import { createKnowledgePackageRepository, type DiscoveryQuery } from "../platform/knowledge-packages";
import { coachHostEnvironment, toKnowledgePackage, type StarterPackDescriptor } from "./knowledge-package";
import type { StarterPack } from "./types";
import { waterpoloPack } from "./waterpolo";

/**
 * FEATURE-003.2 — Catálogo oficial de Coach publicado en el repositorio de
 * Knowledge Packages de la plataforma.
 *
 * Añadir un deporte = añadir datos. Añadir packs de comunidad, enterprise,
 * privados o de marketplace = registrar más descriptores en este mismo
 * repositorio, sin cambiar el modelo de dominio.
 */

export const starterPacks: readonly StarterPack[] = [waterpoloPack];

/** Repositorio lógico con el catálogo oficial ya validado y con checksum. */
export const knowledgePackages = createKnowledgePackageRepository(
  starterPacks.map(toKnowledgePackage),
);

export function findStarterPack(id: string, version?: string): StarterPack | undefined {
  return (knowledgePackages.get(id, version) as StarterPackDescriptor | undefined)?.payload;
}

/** Descriptor de plataforma de un pack (metadatos, compatibilidad, checksum). */
export function findPackageDescriptor(id: string, version?: string): StarterPackDescriptor | undefined {
  return knowledgePackages.get(id, version) as StarterPackDescriptor | undefined;
}

/** Última versión publicada de un pack del catálogo oficial. */
export function latestVersionOf(id: string): string | null {
  return knowledgePackages.latest(id)?.version ?? null;
}

/** Descubrimiento: por defecto, lo instalable por Coach en este Engine. */
export function discoverStarterPacks(query: DiscoveryQuery = {}): StarterPackDescriptor[] {
  return knowledgePackages.find({
    kind: "starter_pack",
    product: coachHostEnvironment.product,
    ...query,
  }) as StarterPackDescriptor[];
}

/**
 * Plan de instalación resuelto (dependencias primero) y validado contra el
 * entorno actual. Un paquete incompatible nunca llega a la base de datos.
 */
export function resolveInstallOrder(id: string, version?: string) {
  return knowledgePackages.resolveInstall(id, coachHostEnvironment, version);
}
