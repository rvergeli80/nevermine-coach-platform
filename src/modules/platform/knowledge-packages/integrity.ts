/**
 * FEATURE-003.2 — Integridad de los Knowledge Packages.
 *
 * El checksum es la huella canónica del contenido: dos paquetes con el mismo
 * contenido producen el mismo valor, independientemente del orden de las
 * claves. Es la base sobre la que se apoyará la firma criptográfica.
 */

import type { KnowledgePackageDescriptor, PackageSignature } from "./types";

/** Serialización canónica: claves ordenadas y `undefined` descartado. */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(",")}}`;
}

/** Hash estable FNV-1a de 64 bits (en dos mitades de 32) sobre la forma canónica. */
export function checksumOf(value: unknown): string {
  const json = canonicalize(value);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < json.length; i += 1) {
    const code = json.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (code + i), 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

/** Checksum de un descriptor: cubre identidad, compatibilidad y contenido. */
export function checksumOfDescriptor(
  descriptor: Omit<KnowledgePackageDescriptor, "checksum" | "signature"> &
    Partial<Pick<KnowledgePackageDescriptor, "checksum" | "signature">>,
): string {
  const { checksum: _checksum, signature: _signature, ...rest } = descriptor;
  return checksumOf(rest);
}

export type IntegrityResult =
  | { ok: true; signed: boolean }
  | { ok: false; errors: string[]; signed: boolean };

/**
 * Verifica la integridad declarada del paquete.
 *
 * Hoy sólo se comprueba el checksum: la firma está *preparada* (sobre
 * `signature`) pero no implementada, de modo que un paquete `unsigned` es
 * válido. Cuando exista firma, este es el único punto que debe cambiar.
 */
export function verifyIntegrity(descriptor: KnowledgePackageDescriptor): IntegrityResult {
  const errors: string[] = [];
  const signed = isSigned(descriptor.signature);

  if (!descriptor.checksum) {
    errors.push("El paquete no declara checksum.");
  } else {
    const expected = checksumOfDescriptor(descriptor);
    if (expected !== descriptor.checksum) {
      errors.push(
        `El checksum no coincide con el contenido (declarado "${descriptor.checksum}", calculado "${expected}").`,
      );
    }
  }

  if (descriptor.signature.algorithm !== "none") {
    errors.push("La verificación de firma criptográfica todavía no está soportada.");
  }

  return errors.length > 0 ? { ok: false, errors, signed } : { ok: true, signed };
}

export function isSigned(signature: PackageSignature): boolean {
  return signature.algorithm !== "none" && Boolean(signature.value);
}
