import {
  createKnowledgePackageRepository,
  type CertificationReport,
  type DiscoveryQuery,
  type LifecycleTransition,
  type TransitionRequest,
} from "../platform/knowledge-packages";
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
  // FEATURE-003.3: el catálogo oficial se certifica contra el entorno de Coach
  // antes de admitirse como publicado.
  { hosts: [coachHostEnvironment] },
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

/**
 * FEATURE-003.3 — Ciclo de vida de distribución.
 * Coach delega en la plataforma: aquí sólo se exponen los verbos.
 */

/** Certificación automática de una versión del catálogo. */
export function certifyStarterPack(id: string, version?: string): CertificationReport | undefined {
  return knowledgePackages.certify(id, version);
}

/** Transición explícita de estado (draft → review → certified → published…). */
export function transitionStarterPack(id: string, version: string, request: TransitionRequest) {
  return knowledgePackages.transition(id, version, request);
}

/** Historial append-only de transiciones. */
export function starterPackLifecycleHistory(
  id?: string,
  version?: string,
): readonly LifecycleTransition[] {
  return knowledgePackages.lifecycleHistory(id, version);
}

/** ¿Es instalable? Sólo lo publicado se distribuye. */
export function isStarterPackDistributable(id: string, version?: string): boolean {
  return knowledgePackages.isDistributable(id, version);
}

/** Estado de distribución vigente de una versión. */
export function starterPackLifecycleState(id: string, version: string) {
  return knowledgePackages.stateOf(id, version);
}
