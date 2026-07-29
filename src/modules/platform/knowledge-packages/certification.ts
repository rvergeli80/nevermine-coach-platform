/**
 * FEATURE-003.3 — Certificación automática de Knowledge Packages.
 *
 * Certificar es responder, de forma reproducible y sin intervención humana, a
 * una pregunta: ¿este paquete puede distribuirse? En esta Feature la
 * certificación es exclusivamente funcional (validaciones automáticas): no hay
 * firma criptográfica ni aprobación manual. El informe resultante es la
 * evidencia que acompaña a la transición de estado.
 */

import { checkCompatibility } from "./compatibility";
import { resolveDependencies } from "./dependencies";
import { checksumOfDescriptor, verifyIntegrity } from "./integrity";
import { checkDescriptor } from "./validation";
import type { HostEnvironment, KnowledgePackageDescriptor } from "./types";

/** Controles ejecutados por la certificación automática. */
export type CertificationCheckId =
  | "descriptor"
  | "integrity"
  | "checksum"
  | "compatibility"
  | "dependencies";

export interface CertificationCheck {
  id: CertificationCheckId;
  /** Descripción legible del control (para el informe y la auditoría). */
  label: string;
  ok: boolean;
  errors: string[];
  /** Un control omitido (sin entorno o sin dependencias) no invalida el informe. */
  skipped?: boolean;
}

export interface CertificationReport {
  packageId: string;
  version: string;
  ok: boolean;
  checksum: string;
  checks: CertificationCheck[];
  errors: string[];
  /** ISO 8601. */
  certifiedAt: string;
  /** La firma criptográfica queda fuera del alcance de esta Feature. */
  signatureVerified: false;
}

export interface CertificationOptions {
  /** Entornos frente a los que debe demostrarse compatibilidad. */
  hosts?: readonly HostEnvironment[];
  /** Resolución de dependencias contra el repositorio. */
  lookup?: (packageId: string) => KnowledgePackageDescriptor | undefined;
  /** ISO 8601; inyectable para pruebas deterministas. */
  now?: string;
}

/**
 * Ejecuta la certificación automática: forma del descriptor, integridad,
 * checksum, compatibilidad (producto, versión y Engines) y dependencias.
 */
export function certifyPackage(
  descriptor: KnowledgePackageDescriptor,
  options: CertificationOptions = {},
): CertificationReport {
  const checks: CertificationCheck[] = [];

  const descriptorErrors = checkDescriptor(descriptor);
  checks.push({
    id: "descriptor",
    label: "Descriptor válido y completo",
    ok: descriptorErrors.length === 0,
    errors: descriptorErrors,
  });

  const integrity = verifyIntegrity(descriptor);
  checks.push({
    id: "integrity",
    label: "Integridad declarada del paquete",
    ok: integrity.ok,
    errors: integrity.ok ? [] : integrity.errors,
  });

  const expected = checksumOfDescriptor(descriptor);
  checks.push({
    id: "checksum",
    label: "Checksum reproducible del contenido",
    ok: expected === descriptor.checksum,
    errors:
      expected === descriptor.checksum
        ? []
        : [`El checksum no reproduce el contenido (esperado "${expected}").`],
  });

  const hosts = options.hosts ?? [];
  if (hosts.length === 0) {
    checks.push({
      id: "compatibility",
      label: "Compatibilidad con producto, versión y Engines",
      ok: true,
      errors: [],
      skipped: true,
    });
  } else {
    // El estado de distribución lo gobierna el ciclo de vida, no la
    // compatibilidad: aquí sólo se comprueba producto, versión y Engines.
    const candidate = { ...descriptor, status: "published" as const };
    const errors = hosts.flatMap((host) => {
      const result = checkCompatibility(candidate, host);
      return result.ok ? [] : result.errors;
    });
    checks.push({
      id: "compatibility",
      label: "Compatibilidad con producto, versión y Engines",
      ok: errors.length === 0,
      errors,
    });
  }

  if (!options.lookup) {
    checks.push({
      id: "dependencies",
      label: "Dependencias resolubles y sin ciclos",
      ok: true,
      errors: [],
      skipped: true,
    });
  } else {
    const resolved = resolveDependencies(descriptor, options.lookup);
    checks.push({
      id: "dependencies",
      label: "Dependencias resolubles y sin ciclos",
      ok: resolved.ok,
      errors: resolved.ok ? [] : resolved.errors,
    });
  }

  const errors = checks.flatMap((check) => check.errors);

  return {
    packageId: descriptor?.id ?? "?",
    version: descriptor?.version ?? "?",
    ok: errors.length === 0,
    checksum: expected,
    checks,
    errors,
    certifiedAt: options.now ?? new Date().toISOString(),
    signatureVerified: false,
  };
}

/** Evidencia compacta del informe para adjuntarla al historial. */
export function certificationEvidence(report: CertificationReport): Record<string, unknown> {
  return {
    certifiedAt: report.certifiedAt,
    checksum: report.checksum,
    signatureVerified: report.signatureVerified,
    checks: report.checks.map((c) => ({ id: c.id, ok: c.ok, skipped: c.skipped ?? false })),
  };
}
