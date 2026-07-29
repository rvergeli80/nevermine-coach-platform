/**
 * FEATURE-003.2 — Compatibilidad de un Knowledge Package con su entorno.
 *
 * Regla dura: un paquete incompatible nunca se instala. La comprobación es
 * pura y se ejecuta antes de tocar nada de la infraestructura.
 */

import { satisfiesRange } from "../semver";
import type { HostEnvironment, KnowledgePackageDescriptor, ProductRequirement } from "./types";

export type CompatibilityResult = { ok: true } | { ok: false; errors: string[] };

export function findProductRequirement(
  descriptor: KnowledgePackageDescriptor,
  product: string,
): ProductRequirement | undefined {
  return descriptor.compatibility.products.find((p) => p.product === product);
}

/** ¿El paquete declara compatibilidad con el producto y versión del entorno? */
export function checkCompatibility(
  descriptor: KnowledgePackageDescriptor,
  host: HostEnvironment,
): CompatibilityResult {
  const errors: string[] = [];

  if (descriptor.status !== "published") {
    errors.push(`El paquete "${descriptor.id}" no está publicado y no puede instalarse.`);
  }

  const requirement = findProductRequirement(descriptor, host.product);
  if (!requirement) {
    errors.push(`El paquete "${descriptor.id}" no declara compatibilidad con el producto "${host.product}".`);
  } else if (!satisfiesRange(host.productVersion, requirement)) {
    errors.push(
      `El paquete "${descriptor.id}" requiere "${host.product}" ${requirement.minVersion}` +
        `${requirement.maxVersion ? `–${requirement.maxVersion}` : " o superior"}` +
        ` (actual ${host.productVersion}).`,
    );
  }

  for (const required of descriptor.compatibility.engines) {
    const available = host.engines.find((e) => e.engine === required.engine);
    if (!available) {
      errors.push(`El paquete "${descriptor.id}" requiere el Engine "${required.engine}", no disponible.`);
      continue;
    }
    if (!satisfiesRange(available.version, required)) {
      errors.push(
        `El paquete "${descriptor.id}" requiere "${required.engine}" ${required.minVersion}` +
          `${required.maxVersion ? `–${required.maxVersion}` : " o superior"}` +
          ` (actual ${available.version}).`,
      );
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true };
}

export function isCompatible(
  descriptor: KnowledgePackageDescriptor,
  host: HostEnvironment,
): boolean {
  return checkCompatibility(descriptor, host).ok;
}
