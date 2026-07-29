/**
 * FEATURE-003.2 — Validación del descriptor de un Knowledge Package.
 *
 * Reglas puras: un descriptor inválido nunca entra en el repositorio. La
 * validación es de *forma y contrato*, nunca del contenido específico de un
 * producto (eso corresponde a quien define el `kind`).
 */

import { isValidVersion } from "../semver";
import { verifyIntegrity } from "./integrity";
import type { KnowledgePackageDescriptor } from "./types";

const ID_RE = /^[a-z][a-z0-9_]{1,63}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SLUG_RE = /^[a-z][a-z0-9_-]{1,63}$/;

const KINDS = new Set(["starter_pack"]);
const ORIGINS = new Set(["official", "community", "enterprise", "private", "marketplace"]);
const STATUSES = new Set(["draft", "published", "deprecated"]);
const TRUSTS = new Set(["unverified", "certified", "partner"]);

/** Errores de forma del descriptor (lista vacía = válido). */
export function checkDescriptor(descriptor: KnowledgePackageDescriptor): string[] {
  const errors: string[] = [];
  const at = (msg: string) => errors.push(`[${descriptor?.id ?? "?"}] ${msg}`);

  if (!descriptor || typeof descriptor !== "object") return ["Descriptor no válido."];
  if (!ID_RE.test(descriptor.id ?? "")) at(`Identificador de paquete no válido: "${descriptor.id}".`);
  if (!descriptor.name?.trim()) at("El paquete no declara nombre.");
  if (!descriptor.summary?.trim()) at("El paquete no declara resumen.");
  if (!descriptor.author?.trim()) at("El paquete no declara autor.");
  if (!KINDS.has(descriptor.kind)) at(`Tipo de paquete no soportado: "${descriptor.kind}".`);
  if (!ORIGINS.has(descriptor.origin)) at(`Origen no válido: "${descriptor.origin}".`);
  if (!STATUSES.has(descriptor.status)) at(`Estado no válido: "${descriptor.status}".`);
  if (!TRUSTS.has(descriptor.trust)) at(`Nivel de confianza no válido: "${descriptor.trust}".`);
  if (!isValidVersion(descriptor.version ?? "")) at(`Versión no válida: "${descriptor.version}".`);
  if (!DATE_RE.test(descriptor.publishedAt ?? "")) at("Fecha de publicación no válida.");
  if (!SLUG_RE.test(descriptor.domain ?? "")) at(`Dominio no válido: "${descriptor.domain}".`);
  if (!SLUG_RE.test(descriptor.category ?? "")) at(`Categoría no válida: "${descriptor.category}".`);
  if (!Array.isArray(descriptor.tags)) at("Las etiquetas deben ser una lista.");

  const products = descriptor.compatibility?.products ?? [];
  const engines = descriptor.compatibility?.engines ?? [];
  if (products.length === 0) at("El paquete no declara ningún producto compatible.");
  for (const product of products) {
    if (!SLUG_RE.test(product.product ?? "")) at(`Producto no válido: "${product.product}".`);
    if (!isValidVersion(product.minVersion ?? "")) at(`Versión mínima no válida para "${product.product}".`);
    if (product.maxVersion && !isValidVersion(product.maxVersion)) {
      at(`Versión máxima no válida para "${product.product}".`);
    }
  }
  for (const engine of engines) {
    if (!SLUG_RE.test(engine.engine ?? "")) at(`Engine no válido: "${engine.engine}".`);
    if (!isValidVersion(engine.minVersion ?? "")) at(`Versión mínima no válida para "${engine.engine}".`);
    if (engine.maxVersion && !isValidVersion(engine.maxVersion)) {
      at(`Versión máxima no válida para "${engine.engine}".`);
    }
  }

  const seen = new Set<string>();
  for (const dep of descriptor.dependencies ?? []) {
    if (!ID_RE.test(dep.packageId ?? "")) at(`Dependencia no válida: "${dep.packageId}".`);
    if (dep.packageId === descriptor.id) at("Un paquete no puede depender de sí mismo.");
    if (seen.has(dep.packageId)) at(`Dependencia duplicada: "${dep.packageId}".`);
    seen.add(dep.packageId);
    if (!isValidVersion(dep.minVersion ?? "")) at(`Versión mínima no válida en "${dep.packageId}".`);
    if (dep.maxVersion && !isValidVersion(dep.maxVersion)) {
      at(`Versión máxima no válida en "${dep.packageId}".`);
    }
  }

  if (!descriptor.signature || typeof descriptor.signature !== "object") {
    at("El paquete no declara sobre de firma.");
  }

  if (errors.length === 0) {
    const integrity = verifyIntegrity(descriptor);
    if (!integrity.ok) errors.push(...integrity.errors.map((e) => `[${descriptor.id}] ${e}`));
  }

  return errors;
}

export function isValidDescriptor(descriptor: KnowledgePackageDescriptor): boolean {
  return checkDescriptor(descriptor).length === 0;
}
