/**
 * FEATURE-003.9 — Update Discovery & Compatibility Validation.
 *
 * Antes de anunciar una actualización se comprueba, en este orden y sin
 * excepciones: canal permitido, ciclo de vida, publisher, confianza,
 * compatibilidad con el entorno, dependencias e integridad. Una actualización
 * que no supera todos los controles **no se anuncia**.
 */

import { checkCompatibility } from "../compatibility";
import { isAuthorizedToPublish, type TrustLevel } from "../governance";
import { verifyIntegrity } from "../integrity";
import { isDistributableState } from "../lifecycle";
import type { KnowledgePackageRepository } from "../repository";
import type { HostEnvironment, KnowledgePackageDescriptor } from "../types";
import type { DistributionChannel, PublicationEntry } from "./types";

export interface AnnouncementContext {
  repository: KnowledgePackageRepository;
  host: HostEnvironment;
  /** Canales que acepta la instalación consumidora. */
  channels: readonly DistributionChannel[];
  /** Niveles de confianza admitidos por el consumidor (null = todos). */
  allowedTrustLevels?: readonly TrustLevel[] | null;
}

export interface AnnouncementValidation {
  ok: boolean;
  errors: string[];
}

/**
 * Validación completa de un candidato a anunciarse. Pura respecto al estado:
 * sólo lee del repositorio y del registro de publicaciones.
 */
export function validateAnnouncement(
  descriptor: KnowledgePackageDescriptor,
  publication: PublicationEntry | undefined,
  context: AnnouncementContext,
): AnnouncementValidation {
  const errors: string[] = [];

  // 1. Publicación vigente y canal aceptado por la instalación.
  if (!publication) {
    errors.push(`La versión ${descriptor.version} no está publicada en el registro de distribución.`);
  } else {
    if (!publication.active) {
      errors.push(
        `La publicación de ${descriptor.id}@${descriptor.version} fue retirada${publication.revokeReason ? `: ${publication.revokeReason}` : "."}`,
      );
    }
    if (!context.channels.includes(publication.publicationChannel)) {
      errors.push(
        `El canal "${publication.publicationChannel}" no está admitido por esta instalación (admitidos: ${context.channels.join(", ")}).`,
      );
    }
  }

  // 2. Ciclo de vida: sólo lo publicado se distribuye.
  const state = context.repository.stateOf(descriptor.id, descriptor.version) ?? descriptor.status;
  if (!isDistributableState(state)) {
    errors.push(`Estado "${state}": sólo se anuncia lo publicado.`);
  }

  // 3. Publisher autorizado a distribuir.
  const publisher = context.repository.publisherOf(descriptor.id, descriptor.version);
  if (!publisher) {
    errors.push(`El paquete "${descriptor.id}" no tiene Publisher registrado.`);
  } else if (!isAuthorizedToPublish(publisher)) {
    errors.push(`El Publisher "${publisher.id}" no está autorizado a distribuir.`);
  }

  // 4. Nivel de confianza admitido.
  const allowed = context.allowedTrustLevels ?? null;
  if (allowed && !allowed.includes(descriptor.trust)) {
    errors.push(
      `Nivel de confianza "${descriptor.trust}" no admitido (permitidos: ${allowed.join(", ")}).`,
    );
  }

  // 5. Compatibilidad con producto y Engines del entorno. El estado que manda
  //    es el del ciclo de vida (FEATURE-003.3), no el sellado en el descriptor.
  const compatibility = checkCompatibility({ ...descriptor, status: state }, context.host);
  if (!compatibility.ok) errors.push(...compatibility.errors);

  // 6. Dependencias resolubles y distribuibles.
  const plan = context.repository.resolveInstall(descriptor.id, context.host, descriptor.version);
  if (!plan.ok) errors.push(...plan.errors);

  // 7. Integridad del contenido anunciado.
  const integrity = verifyIntegrity(descriptor);
  if (!integrity.ok) errors.push(...integrity.errors.map((e) => `Integridad: ${e}`));

  return { ok: errors.length === 0, errors };
}
