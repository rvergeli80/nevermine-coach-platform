/**
 * FEATURE-003.9 — Adaptador Coach del Distribution Engine.
 *
 * Coach nunca busca versiones por su cuenta: pregunta al DistributionService
 * de la plataforma. Aquí sólo se declara *cómo* se proyecta un Starter Pack
 * sobre el modelo de distribución (canal y política) y qué canales acepta el
 * producto.
 */

import {
  DistributionService,
  PublicationRegistry,
  type ChannelSubscription,
  type DistributionChannel,
  type InstallationService,
  type KnowledgePackageDescriptor,
  type UpdatePolicy,
} from "../platform/knowledge-packages";
import { coachHostEnvironment, type StarterPackDescriptor } from "./knowledge-package";
import { knowledgePackages } from "./repository";

/**
 * Canales que Coach admite hoy. Ninguna versión de un canal no listado puede
 * anunciarse ni instalarse automáticamente.
 */
export const COACH_CHANNELS: readonly DistributionChannel[] = ["stable"];

/** Suscripción por defecto del producto: canal estable y conocimiento oficial. */
export const coachSubscription: ChannelSubscription = {
  channels: COACH_CHANNELS,
  allowedTrustLevels: ["official"],
};

const channelOf = (descriptor: KnowledgePackageDescriptor): DistributionChannel | undefined =>
  (descriptor as StarterPackDescriptor).payload?.distribution?.channel;

const policyOf = (descriptor: KnowledgePackageDescriptor): UpdatePolicy | undefined =>
  (descriptor as StarterPackDescriptor).payload?.distribution?.updatePolicy;

/**
 * Registro de publicaciones del catálogo oficial. Vive en memoria del proceso:
 * el catálogo oficial es código+datos versionados, no contenido de usuario.
 */
export const coachPublicationRegistry = new PublicationRegistry();

/**
 * Motor de distribución del catálogo oficial de Coach. Sin Installation
 * Engine asociado: sólo informa. Para ejecutar una actualización se construye
 * un servicio con ámbito (`createCoachDistributionService`).
 */
export const coachDistribution = new DistributionService({
  repository: knowledgePackages,
  host: coachHostEnvironment,
  registry: coachPublicationRegistry,
  subscription: coachSubscription,
  channelOf,
  policyOf,
});

// El catálogo oficial ya nace publicado en el repositorio: se sincroniza el
// registro de distribución para que lo publicado sea también lo anunciable.
coachDistribution.bootstrap("nevermine_official");

/**
 * Motor de distribución con capacidad de delegar en el Installation Engine del
 * ámbito activo. Sigue sin instalar nada por su cuenta: delega.
 */
export function createCoachDistributionService(
  installations: InstallationService,
): DistributionService {
  return new DistributionService({
    repository: knowledgePackages,
    host: coachHostEnvironment,
    registry: coachPublicationRegistry,
    subscription: coachSubscription,
    installations,
    channelOf,
    policyOf,
  });
}

/** Política de actualización declarada por un pack (Coach sólo la consulta). */
export function starterPackUpdatePolicy(packId: string): UpdatePolicy {
  return coachDistribution.getDistributionStatus(packId).updatePolicy;
}

/** Estado de distribución de un pack: publicaciones activas y canales. */
export function starterPackDistributionStatus(packId: string) {
  return coachDistribution.getDistributionStatus(packId);
}
